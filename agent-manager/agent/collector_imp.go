package agent

import (
	context "context"
	"fmt"
	"io"
	"os"
	"strconv"
	sync "sync"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/agent-manager/config"
	"github.com/hivearmor/agent-manager/database"
	"github.com/hivearmor/agent-manager/metrics"
	"github.com/hivearmor/agent-manager/models"
	"github.com/hivearmor/agent-manager/utils"
	"github.com/threatwinds/go-sdk/catcher"
	utmconf "github.com/utmstack/config-client-go"
	"github.com/utmstack/config-client-go/enum"
	"github.com/utmstack/config-client-go/types"
	codes "google.golang.org/grpc/codes"
	status "google.golang.org/grpc/status"
)

var (
	CollectorServ     *CollectorService
	collectorServOnce sync.Once
)

type ConfigStatus int32

const (
	ConfigSent    ConfigStatus = 1
	ConfigPending ConfigStatus = 2
)

type CollectorService struct {
	UnimplementedCollectorServiceServer
	UnimplementedPanelCollectorServiceServer

	CollectorStreamMap        map[uint]CollectorService_CollectorStreamServer
	CollectorStreamMutex      sync.Mutex
	CollectorConfigsCache     map[uint][]*CollectorConfigGroup
	CollectorConfigsCacheM    sync.Mutex
	CacheCollectorKey         map[uint]string
	CacheCollectorKeyMutex    sync.RWMutex
	CollectorPendigConfigChan chan *CollectorConfig
	CollectorTypes            []enum.UTMModule

	DBConnection *database.DB
}

func (s *CollectorService) ValidateCollectorKey(key string, id uint) bool {
	s.CacheCollectorKeyMutex.RLock()
	defer s.CacheCollectorKeyMutex.RUnlock()
	_, valid := utils.IsKeyPairValid(key, id, s.CacheCollectorKey)
	return valid
}

func InitCollectorService() {
	collectorServOnce.Do(func() {
		CollectorServ = &CollectorService{
			CollectorStreamMap:        make(map[uint]CollectorService_CollectorStreamServer),
			CollectorConfigsCache:     make(map[uint][]*CollectorConfigGroup),
			CacheCollectorKey:         make(map[uint]string),
			CollectorPendigConfigChan: make(chan *CollectorConfig, 1000),
			CollectorTypes:            []enum.UTMModule{},
			DBConnection:              database.GetDB(),
		}
		collectors := []models.Collector{}
		_, err := CollectorServ.DBConnection.GetAll(&collectors, "")
		if err != nil {
			_ = catcher.Error("failed to fetch collectors", err, map[string]any{"process": "agent-manager"})
			time.Sleep(5 * time.Second)
			os.Exit(1)
		}
		for _, c := range collectors {
			CollectorServ.CacheCollectorKey[c.ID] = c.CollectorKey
		}

		go CollectorServ.ProcessPendingConfigs()

	external:
		for {
			client := utmconf.NewUTMClient(config.InternalKey, config.PanelServiceName)
			for _, moduleType := range CollectorServ.CollectorTypes {
				moduleConfig := &types.ConfigurationSection{}
				moduleConfig, err = client.GetUTMConfig(moduleType)
				if err != nil {
					catcher.Error("failed to get module config", err, map[string]any{"process": "agent-manager"})
					time.Sleep(5 * time.Second)
					continue external
				}

				pendigConfigs := make(map[string][]*CollectorConfigGroup)
				for _, group := range moduleConfig.ConfigurationGroups {
					var idInt int
					idInt, err = strconv.Atoi(group.CollectorID)
					if err != nil {
						catcher.Error("invalid collector ID", err, map[string]any{"process": "agent-manager"})
						continue
					}

					CollectorServ.CollectorConfigsCache[uint(idInt)] = append(
						CollectorServ.CollectorConfigsCache[uint(idInt)],
						convertModuleGroupToCollectorProto(group),
					)

					pendigConfigs[group.CollectorID] = append(pendigConfigs[group.CollectorID], convertModuleGroupToCollectorProto(group))
				}

				for id, configs := range pendigConfigs {
					CollectorServ.CollectorPendigConfigChan <- &CollectorConfig{
						CollectorId: id,
						RequestId:   uuid.New().String(),
						Groups:      configs,
					}
				}
			}
			break
		}
	})
}

func (s *CollectorService) RegisterCollector(ctx context.Context, req *RegisterRequest) (*AuthResponse, error) {
	tenantID := req.GetTenantId()

	collector := &models.Collector{
		Ip:       req.GetIp(),
		Hostname: req.GetHostname(),
		Version:  req.GetVersion(),
		Module:   models.CollectorModule(req.GetCollector().String()),
		TenantID: tenantID,
	}

	oldCollector := &models.Collector{}
	err := s.DBConnection.GetFirst(oldCollector, "hostname = ? and module = ?", collector.Hostname, string(collector.Module))
	if err == nil {
		if oldCollector.Ip != collector.Ip {
			catcher.Error("collector already registered with different IP", nil, map[string]any{"hostname": oldCollector.Hostname, "module": oldCollector.Module, "id": oldCollector.ID, "process": "agent-manager"})
			return nil, status.Errorf(codes.AlreadyExists, "hostname has already been registered")
		}

		boundTenant, err := bindExistingCollectorTenant(s, oldCollector, tenantID)
		if err != nil {
			return nil, err
		}
		return &AuthResponse{
			Id:       uint32(oldCollector.ID),
			Key:      oldCollector.CollectorKey,
			TenantId: boundTenant,
		}, nil
	}

	if tenantID <= 0 {
		return nil, status.Error(codes.InvalidArgument, "tenant is required for collector registration")
	}

	key := uuid.New().String()
	collector.CollectorKey = key
	err = s.DBConnection.Create(collector)
	if err != nil {
		catcher.Error("failed to create collector", err, map[string]any{"process": "agent-manager"})
		return nil, status.Error(codes.Internal, fmt.Sprintf("failed to create collector: %v", err))
	}

	s.CacheCollectorKeyMutex.Lock()
	s.CacheCollectorKey[collector.ID] = key
	s.CacheCollectorKeyMutex.Unlock()

	LastSeenChannel <- models.LastSeen{
		ConnectorType: "collector",
		ConnectorID:   collector.ID,
		LastPing:      time.Now(),
	}

	catcher.Info("Collector registered correctly", map[string]any{"hostname": collector.Hostname, "module": collector.Module, "id": collector.ID, "tenant_id": collector.TenantID, "process": "agent-manager"})
	return &AuthResponse{
		Id:       uint32(collector.ID),
		Key:      key,
		TenantId: collector.TenantID,
	}, nil
}

// bindExistingCollectorTenant returns the stored tenant for a re-registering
// collector. Unbound rows (tenant_id=0) may be bound once. Conflicting tenants fail closed.
func bindExistingCollectorTenant(s *CollectorService, old *models.Collector, requested int64) (int64, error) {
	bound, needsUpdate, err := resolveCollectorTenantOnReregister(old.TenantID, requested)
	if err != nil {
		return 0, err
	}
	if !needsUpdate {
		return bound, nil
	}
	if err := s.DBConnection.Upsert(&models.Collector{}, "id = ?", map[string]interface{}{"tenant_id": bound}, old.ID); err != nil {
		catcher.Error("failed to bind collector tenant", err, map[string]any{"collector_id": old.ID, "process": "agent-manager"})
		return 0, status.Error(codes.Internal, "failed to bind collector tenant")
	}
	old.TenantID = bound
	catcher.Info("Collector tenant bound on re-registration", map[string]any{"collector_id": old.ID, "tenant_id": bound, "process": "agent-manager"})
	return bound, nil
}

// resolveCollectorTenantOnReregister decides the tenant for an existing collector.
// needsUpdate is true when an unbound row should be persisted with requested.
func resolveCollectorTenantOnReregister(stored, requested int64) (bound int64, needsUpdate bool, err error) {
	if stored > 0 {
		if requested > 0 && requested != stored {
			return 0, false, status.Error(codes.FailedPrecondition, "collector tenant binding conflict")
		}
		return stored, false, nil
	}
	if requested <= 0 {
		return 0, false, status.Error(codes.FailedPrecondition, "collector identity has no tenant binding")
	}
	return requested, true, nil
}

func (s *CollectorService) DeleteCollector(ctx context.Context, req *DeleteRequest) (*AuthResponse, error) {
	id, _, _, err := utils.GetItemsFromContext(ctx)
	if err != nil {
		return nil, err
	}
	idInt, err := strconv.Atoi(id)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid id")
	}

	err = s.DBConnection.Upsert(&models.Collector{}, "id = ?", map[string]interface{}{"deleted_by": req.DeletedBy}, id)
	if err != nil {
		catcher.Error("unable to delete collector", err, map[string]any{"process": "agent-manager"})
	}

	err = s.DBConnection.Delete(&models.Collector{}, "id = ?", false, id)
	if err != nil {
		catcher.Error("unable to delete collector", err, map[string]any{"process": "agent-manager"})
		return nil, status.Error(codes.Internal, fmt.Sprintf("unable to delete collector: %v", err.Error()))
	}

	s.CacheCollectorKeyMutex.Lock()
	delete(s.CacheCollectorKey, uint(idInt))
	s.CacheCollectorKeyMutex.Unlock()

	s.CollectorStreamMutex.Lock()
	delete(s.CollectorStreamMap, uint(idInt))
	s.CollectorStreamMutex.Unlock()

	catcher.Info("Collector deleted", map[string]any{"collector_id": idInt, "deleted_by": req.DeletedBy, "process": "agent-manager"})
	return &AuthResponse{
		Id: uint32(idInt),
	}, nil
}

func (s *CollectorService) ListCollector(ctx context.Context, req *ListRequest) (*ListCollectorResponse, error) {
	pageNumber, pageSize := utils.BoundInventoryPage(req.GetPageNumber(), req.GetPageSize())
	page := utils.NewPaginator(pageSize, pageNumber, req.SortBy)
	filter := utils.NewFilter(req.SearchQuery)

	collectors := []models.Collector{}
	total, err := s.DBConnection.GetByPagination(&collectors, page, filter, "", false)
	if err != nil {
		catcher.Error("failed to fetch collectors", err, map[string]any{"process": "agent-manager"})
		return nil, status.Errorf(codes.Internal, "failed to fetch collectors: %v", err)
	}
	return convertModelToCollectorResponse(collectors, total), nil
}

func (s *CollectorService) ProcessPendingConfigs() {
	for configs := range s.CollectorPendigConfigChan {
		collectorID, err := strconv.Atoi(configs.CollectorId)
		if err != nil {
			catcher.Error("invalid collector ID", err, map[string]any{"process": "agent-manager"})
			continue
		}

		s.CollectorStreamMutex.Lock()
		stream, ok := s.CollectorStreamMap[uint(collectorID)]
		s.CollectorStreamMutex.Unlock()

		if ok {
			err = stream.Send(&CollectorMessages{
				StreamMessage: &CollectorMessages_Config{
					Config: &CollectorConfig{
						Groups: configs.Groups,
					},
				},
			})
			if err != nil {
				catcher.Error("failed to send config to collector", err, map[string]any{"process": "agent-manager"})
			}
		}
	}
}

func (s *CollectorService) CollectorStream(stream CollectorService_CollectorStreamServer) error {
	id, _, _, err := utils.GetItemsFromContext(stream.Context())
	if err != nil {
		return status.Error(codes.InvalidArgument, fmt.Errorf("unable to get items from context: %v", err).Error())
	}
	uid, err := strconv.Atoi(id)
	if err != nil {
		return status.Error(codes.InvalidArgument, fmt.Errorf("invalid id: %v", err).Error())
	}

	s.CollectorStreamMutex.Lock()
	if _, ok := s.CollectorStreamMap[uint(uid)]; ok {
		s.CollectorStreamMutex.Unlock()
		return status.Error(codes.AlreadyExists, "client is already connected")
	}
	s.CollectorStreamMap[uint(uid)] = stream
	metrics.ConnectedCollectors.Inc()
	s.CollectorStreamMutex.Unlock()
	defer func() {
		s.CollectorStreamMutex.Lock()
		delete(s.CollectorStreamMap, uint(uid))
		metrics.ConnectedCollectors.Dec()
		s.CollectorStreamMutex.Unlock()
	}()

	for {
		in, err := stream.Recv()
		if err == io.EOF {
			err = utils.WaitForReconnect(stream.Context(), stream)
			if err != nil {
				return status.Error(codes.Internal, fmt.Sprintf("failed to reconnect to client: %v", err))
			}
			continue
		}
		if err != nil {
			return status.Error(codes.Internal, fmt.Sprintf("failed to receive message from client: %v", err))
		}

		switch msg := in.StreamMessage.(type) {
		case *CollectorMessages_Result:
			catcher.Info("Received Knowledge", map[string]any{"request_id": msg.Result.RequestId, "process": "agent-manager"})

		case *CollectorMessages_Config:
			// Not implemented
		}
	}
}

func (s *CollectorService) GetCollectorConfig(ctx context.Context, in *ConfigRequest) (*CollectorConfig, error) {
	id, _, _, err := utils.GetItemsFromContext(ctx)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, fmt.Errorf("unable to get items from context: %v", err).Error())
	}
	uid, err := strconv.Atoi(id)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, fmt.Errorf("invalid id: %v", err).Error())
	}

	s.CollectorConfigsCacheM.Lock()
	defer s.CollectorConfigsCacheM.Unlock()

	return &CollectorConfig{
		Groups: s.CollectorConfigsCache[uint(uid)],
	}, nil
}

func (s *CollectorService) RegisterCollectorConfig(ctx context.Context, in *CollectorConfig) (*ConfigKnowledge, error) {
	collectorID, err := strconv.Atoi(in.CollectorId)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid collector ID")
	}

	s.CollectorPendigConfigChan <- in

	s.CollectorConfigsCacheM.Lock()
	s.CollectorConfigsCache[uint(collectorID)] = in.Groups
	s.CollectorConfigsCacheM.Unlock()

	return &ConfigKnowledge{
		Accepted:  "true",
		RequestId: in.RequestId,
	}, nil
}

package com.hivearmor.service.collectors;

import io.grpc.*;

import java.util.*;

public class CollectorOpsService {
    /*
    private final String CLASSNAME = "CollectorOpsService";
    private final Logger log = LoggerFactory.getLogger(CollectorOpsService.class);
    private final ManagedChannel channel;
    private final PanelCollectorServiceClient panelCollectorService;
    private final CollectorServiceClient collectorService;
    private final UtmModuleGroupService moduleGroupService;
    private final UtmModuleGroupConfigurationRepository utmModuleGroupConfigurationRepository;

    private final String ENCRYPTION_KEY = System.getenv(Constants.ENV_ENCRYPTION_KEY);

    private final UtmCollectorRepository utmCollectorRepository;

    private final UtmModuleGroupRepository utmModuleGroupRepository;

    private final EntityManager em;

    private final UtmCollectorService utmCollectorService;

    private final UtmModuleService utmModuleService;

    private final UtmModuleRepository utmModuleRepository;

    private final CollectorValidatorService collectorValidatorService;

    public CollectorOpsService(ManagedChannel channel,
                               UtmModuleGroupService moduleGroupService,
                               UtmModuleGroupConfigurationRepository utmModuleGroupConfigurationRepository,
                               UtmCollectorRepository utmCollectorRepository,
                               UtmModuleGroupRepository utmModuleGroupRepository,
                               EntityManager em,
                               UtmCollectorService utmCollectorService,
                               UtmModuleService utmModuleService,
                               UtmModuleRepository utmModuleRepository,
                               CollectorValidatorService collectorValidatorService) throws GrpcConnectionException {

        this.channel = channel;
        this.panelCollectorService = new PanelCollectorServiceClient(channel);
        this.collectorService = new CollectorServiceClient(channel);
        this.moduleGroupService = moduleGroupService;
        this.utmModuleGroupConfigurationRepository = utmModuleGroupConfigurationRepository;
        this.utmCollectorRepository = utmCollectorRepository;
        this.utmModuleGroupRepository = utmModuleGroupRepository;
        this.em = em;
        this.utmCollectorService = utmCollectorService;
        this.utmModuleService = utmModuleService;
        this.utmModuleRepository = utmModuleRepository;
        this.collectorValidatorService = collectorValidatorService;
    }

    *//**
     * Method to update a collector's configuration.
     *
     * @param config is the configuration of the collectors to update.
     * @throws CollectorConfigurationGrpcException if the action can't be performed.
     *//*
    public ConfigKnowledge upsertCollectorConfig(CollectorConfig config) throws CollectorConfigurationGrpcException {
        final String ctx = CLASSNAME + ".upsertCollectorConfig";

        String internalKey = System.getenv(Constants.ENV_INTERNAL_KEY);

        if (!StringUtils.hasText(internalKey)) {
            throw new BadRequestAlertException(ctx + ": Internal key not configured.", ctx, CLASSNAME);
        }

        try {
            return panelCollectorService.insertCollectorConfig(config);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            throw new CollectorConfigurationGrpcException(msg);
        }
    }

    public ListCollectorsResponseDTO listCollector(ListRequest request) {
        return mapToListCollectorsResponseDTO(collectorService.listCollectors(request));
    }

    *//**
     * Method to List all UtmCollector's hostnames.
     *
     * @param request is the request with all the pagination and search params used to list collectors.
     *                according to those params.
     * @throws CollectorServiceGrpcException if the action can't be performed or the request is malformed.
     *//*
    public CollectorHostnames listCollectorHostnames(ListRequest request) throws CollectorServiceGrpcException {
        final String ctx = CLASSNAME + ".ListCollectorHostnames";

        String internalKey = System.getenv(Constants.ENV_INTERNAL_KEY);

        if (!StringUtils.hasText(internalKey)) {
            throw new BadRequestAlertException(ctx + ": Internal key not configured.", ctx, CLASSNAME);
        }

        try {
            ListCollectorResponse response = collectorService.listCollectors(request);
            CollectorHostnames collectorHostnames = new CollectorHostnames();

            response.getRowsList().forEach(c -> {
                collectorHostnames.getHostname().add(c.getHostname());
            });

            return collectorHostnames;
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            throw new CollectorServiceGrpcException(msg);
        }
    }

    *//**
     * Method to get collectors by hostname and module.
     *
     * @param request contains the filter information used to search.
     *//*
    public ListCollectorsResponseDTO getCollectorsByHostnameAndModule(ListRequest request) {
        return mapToListCollectorsResponseDTO(collectorService.listCollectors(request));
    }

    public CollectorConfig getCollectorConfig(CollectorDTO collectorDTO) {
            return collectorService.getCollectorConfig(collectorDTO.getId(), collectorDTO.getCollectorKey(),
                    CollectorModule.valueOf(collectorDTO.getModule().toString()));
    }

    *//**
     * Method to transform a ListCollectorResponse to ListCollectorsResponseDTO
     *//*
    private ListCollectorsResponseDTO mapToListCollectorsResponseDTO(ListCollectorResponse response) {
        final String ctx = CLASSNAME + ".mapToListCollectorsResponseDTO";
        try {
            ListCollectorsResponseDTO dto = new ListCollectorsResponseDTO();

            List<CollectorDTO> collectorDTOS = response.getRowsList().stream()
                    .map(this::protoToCollectorDto)
                    .collect(Collectors.toList());

            this.utmCollectorService.synchronize(collectorDTOS);

            dto.setCollectors(collectorDTOS);
            dto.setTotal(response.getTotal());

            return dto;
        } catch (Exception e) {
            throw new ApiException(String.format("%s: Error mapping ListCollectorResponse to ListCollectorsResponseDTO: %s", ctx, e.getMessage()), HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    *//**
     * Method to map from List<UtmModuleGroupConfiguration> to CollectorConfig
     *//*

    public CollectorConfig mapToCollectorConfig(List<UtmModuleGroupConfiguration> keys, CollectorDTO collectorDTO) {
        final String ctx = CLASSNAME + ".mapToCollectorConfig";

        // Get distinct groups id
        List<Long> groups = keys.stream().mapToLong(UtmModuleGroupConfiguration::getGroupId).distinct().boxed().collect(Collectors.toList());
        CollectorConfig collectorConfig;
        List<CollectorConfigGroup> collectorGroups = new ArrayList<>();

        // Find all configurations for each group and convert them to CollectorGroupConfigurations
        groups.forEach(g -> {
            Optional<UtmModuleGroup> moduleGroup = moduleGroupService.findOne(g);
            moduleGroup.ifPresent(utmModuleGroup -> collectorGroups.add(CollectorConfigGroup.newBuilder()
                    .setGroupName(utmModuleGroup.getGroupName())
                    .setGroupDescription(utmModuleGroup.getGroupDescription())
                    .addAllConfigurations(
                            // Adding all the CollectorGroupConfigurations of the current group
                            keys.stream().filter(f -> Objects.equals(g, f.getGroupId()))
                                    .map(this::mapToCollectorGroupConfigurations).collect(Collectors.toList())
                    )
                    .setCollectorId(collectorDTO.getId())
                    .build()));
        });

        // Creating the final CollectorConfig object
        collectorConfig = CollectorConfig.newBuilder()
                .setCollectorId(String.valueOf(collectorDTO.getId()))
                .setRequestId(String.valueOf(System.currentTimeMillis()))
                .addAllGroups(collectorGroups)
                .build();
        return collectorConfig;
    }

    *//**
     * Method to transform a UtmCollector to CollectorDTO
     *//*
    private CollectorDTO protoToCollectorDto(Collector collector) {
        return new CollectorDTO(this.utmCollectorService.saveCollector(collector));
    }

    *//**
     * Method to map from UtmModuleGroupConfiguration to CollectorGroupConfigurations
     *//*
    private CollectorGroupConfigurations mapToCollectorGroupConfigurations(UtmModuleGroupConfiguration moduleConfig) {
        return CollectorGroupConfigurations.newBuilder()
                .setConfKey(moduleConfig.getConfKey())
                .setConfName(moduleConfig.getConfName())
                .setConfDescription(moduleConfig.getConfDescription())
                .setConfDataType(moduleConfig.getConfDataType())
                .setConfValue(moduleConfig.getConfValue())
                .setConfRequired(moduleConfig.getConfRequired()).build();
    }

    *//**
     * Method to remove a collector, will be used to remove in the UtmNetworkScanService
     *
     * @param hostname the hostname of the collector to remove
     * @param module   the module of the collector to remove
     *//*
    public void deleteCollector(String hostname, CollectorModuleEnum module) {
        final String ctx = CLASSNAME + ".deleteCollector";

        var request = getListRequestByHostnameAndModule(hostname, module);
        List<CollectorDTO> collectors = getCollectorsByHostnameAndModule(request).getCollectors();

        Optional<CollectorDTO> found = collectors.stream().findFirst();
        if (found.isEmpty()) {
            log.error("{}: Collector {} not found in Agent Manager", ctx, hostname);
            return;
        }

        CollectorDTO collector = found.get();

        collectorService.deleteCollector(
                collector.getId(),
                collector.getCollectorKey()
        );

        log.info("{}: Collector {} deleted successfully", ctx, hostname);

    }


    public List<UtmModuleGroupConfiguration> mapPasswordConfiguration(List<UtmModuleGroupConfiguration> configs) {

        return configs.stream().peek(config -> {
            if (config.getConfDataType().equals("password")) {
                final UtmModuleGroupConfiguration utmModuleGroupConfiguration = utmModuleGroupConfigurationRepository.findById(config.getId())
                        .orElseThrow(() -> new RuntimeException(String.format("Configuration id %s not found", config.getId())));

                if (config.getConfValue().equals(utmModuleGroupConfiguration.getConfValue())) {
                    config.setConfValue(CipherUtil.decrypt(utmModuleGroupConfiguration.getConfValue(), ENCRYPTION_KEY));
                }
            }
        }).collect(Collectors.toList());
    }

    @Transactional
    public void updateGroup(List<Long> collectorsIds, Long assetGroupId) throws Exception {
        final String ctx = CLASSNAME + ".updateGroup";
        Assert.notEmpty(collectorsIds, ctx + ": Missing parameter [collectorsIds]");
        try {
            utmCollectorRepository.updateGroup(collectorsIds, assetGroupId);
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    @Transactional
    public void deleteCollector(Long id) throws Exception {

        Optional<UtmCollector> collector = utmCollectorRepository.findById(id);

        if (collector.isEmpty()) {
            log.error(String.format("Collector with %1$s not found", id));
            throw new RuntimeException(String.format("Collector with %1$s not found", id));
        } else if (collector.get().isActive()) {
            this.deleteCollector(collector.get().getHostname(), CollectorModuleEnum.valueOf(collector.get().getModule()));

            List<UtmModuleGroup> modules = this.utmModuleGroupRepository.findAllByCollector(id.toString());
            if (!modules.isEmpty()) {
                UtmModule module = utmModuleRepository.findById(modules.get(0).getModuleId()).get();

                if (module.getModuleActive()) {
                    modules = this.utmModuleGroupRepository.findAllByModuleId(module.getId())
                            .stream().filter(m -> !m.getCollector().equals(id.toString()))
                            .toList();


                    if (modules.isEmpty()) {
                        this.utmModuleService.activateDeactivate(ModuleActivationDTO.builder()
                                .serverId(module.getServerId())
                                .moduleName(module.getModuleName())
                                .activationStatus(false)
                                .build());
                    }
                }
            }
            this.utmModuleGroupRepository.deleteAllByCollector(id.toString());
        }

        utmCollectorRepository.deleteById(id);
    }


    public String validateCollectorConfig(CollectorConfigDTO collectorConfig) {
        Errors errors = new BeanPropertyBindingResult(collectorConfig, "updateConfigurationKeysBody");
        collectorValidatorService.validate(collectorConfig, errors);

        if (errors.hasErrors()) {
            return "Validation failed: Hostname must be unique for this collector.";
        }
        return null;
    }

    public CollectorConfig cacheCurrentCollectorConfig(CollectorDTO collectorDTO) throws CollectorServiceGrpcException {
        return this.getCollectorConfig(collectorDTO);
    }

    public void updateCollectorConfigViaGrpc(
            CollectorConfigDTO collectorConfig,
            CollectorDTO collectorDTO) throws CollectorConfigurationGrpcException {

        this.upsertCollectorConfig(
                this.mapToCollectorConfig(
                        this.mapPasswordConfiguration(collectorConfig.getKeys()), collectorDTO));
    }

    public void updateCollectorConfigurationKeys(CollectorConfigDTO collectorConfig) throws Exception {
        final String ctx = CLASSNAME + ".updateCollectorConfigurationKeys";
        try {
            List<UtmModuleGroup> configs = utmModuleGroupRepository
                    .findAllByModuleIdAndCollector(collectorConfig.getModuleId(),
                            String.valueOf(collectorConfig.getCollector().getId()));
            List<UtmModuleGroupConfiguration> keys = collectorConfig.getKeys();

            if (CollectionUtils.isEmpty(collectorConfig.getKeys())) {
                utmModuleGroupRepository.deleteAll(configs);
            } else {
                for (UtmModuleGroupConfiguration key : keys) {
                    if (key.getConfDataType().equals("password") && Constants.MASKED_VALUE.equals(key.getConfValue())) {
                        continue;
                    }
                    if (key.getConfRequired() && !StringUtils.hasText(key.getConfValue()))
                        throw new Exception(String.format("No value was found for required configuration: %1$s (%2$s)", key.getConfName(), key.getConfKey()));
                    if (key.getConfDataType().equals("password"))
                        key.setConfValue(CipherUtil.encrypt(key.getConfValue(), System.getenv(Constants.ENV_ENCRYPTION_KEY)));
                }
                List<Long> keyGroupIds = keys.stream()
                        .map(UtmModuleGroupConfiguration::getGroupId)
                        .collect(Collectors.toList());

                List<UtmModuleGroup> groupsToDelete = configs.stream()
                        .filter(utmModuleGroup -> !keyGroupIds.contains(utmModuleGroup.getId()))
                        .collect(Collectors.toList());

                utmModuleGroupRepository.deleteAll(groupsToDelete);
                utmModuleGroupConfigurationRepository.saveAll(keys);
            }

        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    public ListRequest getListRequestByHostnameAndModule(String hostname, CollectorModuleEnum module) {
        String query = "";
        if (module != null && StringUtils.hasText(hostname)) {
            query = "module.Is=" + module.name() + "&hostname.Is=" + hostname;
        } else if (StringUtils.hasText(hostname)) {
            query = "hostname.Is=" + hostname;
        } else if (module != null) {
            query = "module.Is=" + module.name();
        }
        return ListRequest.newBuilder()
                .setPageNumber(1)
                .setPageSize(1000000)
                .setSearchQuery(query)
                .setSortBy("id,desc")
                .build();
    }*/
}

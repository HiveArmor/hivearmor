package com.hivearmor.web.rest.agent_manager;

import com.hivearmor.service.grpc.ListRequest;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.web.rest.errors.AgentNotfoundException;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.service.incident_response.UtmIncidentVariableService;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.web.rest.application_modules.UtmModuleResource;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.vm.AgentRequestVM;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

@RestController
@RequestMapping("/api/agent-manager")
public class AgentManagerResource {
    private static final String CLASSNAME = "AgentManagerResource";
    /** Broader read access for sensor inventory pages. */
    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST', 'ROLE_USER')";
    /** Command history / capability checks — operators only. */
    private static final String COMMAND_READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST')";
    /** Attribute updates and other mutates — Admin / SOC Manager. */
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER')";
    private final Logger log = LoggerFactory.getLogger(UtmModuleResource.class);
    private final AgentGrpcService agentGrpcService;

    private final UtmIncidentVariableService utmIncidentVariableService;
    private final ApplicationEventService eventService;

    public AgentManagerResource(AgentGrpcService agentGrpcService,
                                UtmIncidentVariableService utmIncidentVariableService,
                                ApplicationEventService eventService) {
        this.agentGrpcService = agentGrpcService;
        this.utmIncidentVariableService = utmIncidentVariableService;
        this.eventService = eventService;
    }

    @GetMapping("/agents")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<AgentDTO>> listAgents(
            @RequestParam(required = false) Integer pageNumber,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String searchQuery,
            @RequestParam(required = false) String sortBy) {

        final String ctx = CLASSNAME + ".listAgents";
        try {
            ListRequest request = ListRequest.newBuilder()
                    .setPageNumber(pageNumber != null ? pageNumber : 0)
                    .setPageSize(pageSize != null ? pageSize : 1000000)
                    .setSearchQuery(searchQuery != null ? searchQuery : "")
                    .setSortBy(sortBy != null ? sortBy : "")
                    .build();
            ListAgentsResponseDTO response = agentGrpcService.listAgents(request, TenantScope.requireTenant());
            List<AgentDTO> agentDTOList = response.getAgents();
            agentDTOList.forEach(agentDTO -> agentDTO.setAgentKey("SECRET"));
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Total-Count", Long.toString(response.getTotal()));
            return ResponseEntity.ok().headers(headers).body(agentDTOList);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/agents-with-commands")
    @PreAuthorize(COMMAND_READ_AUTH)
    public ResponseEntity<List<AgentDTO>> listAgentsWithCommands(
            @RequestParam(required = false) Integer pageNumber,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String searchQuery,
            @RequestParam(required = false) String sortBy) {
        final String ctx = CLASSNAME + ".listAgentsWithCommands";
        try {
            ListRequest request = ListRequest.newBuilder()
                    .setPageNumber(pageNumber != null ? pageNumber : 0)
                    .setPageSize(pageSize != null ? pageSize : 1000000)
                    .setSearchQuery(searchQuery != null ? searchQuery : "")
                    .setSortBy(sortBy != null ? sortBy : "")
                    .build();
            ListAgentsResponseDTO response = agentGrpcService.listAgentWithCommands(request, TenantScope.requireTenant());
            List<AgentDTO> agentDTOList = response.getAgents();
            agentDTOList.forEach(agentDTO -> agentDTO.setAgentKey("SECRET"));
            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Total-Count", Long.toString(response.getTotal()));
            return ResponseEntity.ok().headers(headers).body(agentDTOList);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/agent-by-hostname")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<AgentDTO> getAgentByHostname(
            @RequestParam @NotNull String hostname) {
        final String ctx = CLASSNAME + ".getAgentByHostname";
        try {
            AgentDTO response = agentGrpcService.getAgentByHostname(hostname);
            response.setAgentKey("SECRET");
            HttpHeaders headers = new HttpHeaders();
            return ResponseEntity.ok().headers(headers).body(response);
        } catch (AgentNotfoundException nf) {
            // P0A1-T05/T16: not found OR belongs to another tenant → 404 with no
            // detail, so the response cannot distinguish "exists in another tenant"
            // from "does not exist" (no cross-tenant existence disclosure).
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/agent-commands")
    @PreAuthorize(COMMAND_READ_AUTH)
    public ResponseEntity<List<AgentCommandDTO>> listAgentCommands(
            @RequestParam(required = false) Integer pageNumber,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String searchQuery,
            @RequestParam(required = false) String sortBy) {

        final String ctx = CLASSNAME + ".listAgentCommands";
        try {
            ListRequest request = ListRequest.newBuilder()
                    .setPageNumber(pageNumber != null ? pageNumber : 0)
                    .setPageSize(pageSize != null ? pageSize : 1000000)
                    .setSearchQuery(searchQuery != null ? searchQuery : "")
                    .setSortBy(sortBy != null ? sortBy : "")
                    .build();
            ListAgentsCommandsResponseDTO response = agentGrpcService.listAgentCommands(request, TenantScope.requireTenant());

            List<AgentCommandDTO> commands = response.getAgentCommands();

            for (AgentCommandDTO command : commands) {
                command.setResult(utmIncidentVariableService
                        .replaceSecretVariableValuesWithPlaceholders(command.getResult()));
            }

            HttpHeaders headers = new HttpHeaders();
            headers.add("X-Total-Count", Long.toString(response.getTotal()));
            return ResponseEntity.ok().headers(headers).body(commands);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }

    }

    @GetMapping("/can-run-command")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Boolean> canRunCommand(@RequestParam String hostname) {
        final String ctx = CLASSNAME + ".canRunCommand";
        try {
            AgentDTO response = agentGrpcService.getAgentByHostname(hostname);
            return ResponseEntity.ok(response.getStatus() == AgentStatusEnum.ONLINE);
        } catch (AgentNotfoundException nf) {
            // P0A1-T05/T16: host not in the caller's tenant (or absent) → 404, no
            // disclosure. Inherited from the now tenant-scoped getAgentByHostname.
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    /**
     * {@code POST  /update-agent-attrs} : Updates the agent attributes.
     *
     * @param agentRequestVM the attributes to change of the agent and authentication information.
     * @return the {@link ResponseEntity} of type {@link AuthResponseDTO} with status {@code 200 (OK)}, status {@code 400 (Bad request)} if any entity validation fails,
     * or with status {@code 500 (Internal Server Error)} if the agent manager didn't respond to the call.
     */
    @PostMapping("/update-agent-attrs")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<AuthResponseDTO> updateAgentAttributes (@Valid @RequestBody AgentRequestVM agentRequestVM) {
        final String ctx = CLASSNAME + ".updateAgentAttributes";
        try {
            AuthResponseDTO response = agentGrpcService.updateAgentAttributes(agentRequestVM);
            return ResponseEntity.ok().body(response);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    /**
     * {@code DELETE  /agents/{hostname}} : Removes an agent from the fleet (SPEC-07 W6 6.2).
     *
     * <p>Calls the existing tenant-scoped {@link AgentGrpcService#deleteAgent(String)}, which
     * resolves the host via {@code getAgentByHostname} (404 for a missing host OR one in another
     * tenant — no cross-tenant existence disclosure) and forces the current tenant into the
     * gRPC {@code DeleteRequest}. Removal is <strong>irreversible</strong> (re-onboarding requires
     * redeployment); both the attempt and the success are written to the application audit trail
     * with the actor + hostname + tenant.
     *
     * <p>Tenant scope is checked HERE, up front: the underlying service resolves the host before
     * it ever reaches its own {@code tenantId <= 0} guard, so a missing/unresolved tenant would
     * otherwise surface as a misleading 500. We therefore gate on {@link TenantContext#getClientId()}
     * first (400 when no concrete tenant is selected) and map the MSSP no-tenant
     * {@link AccessDeniedException} to 403.
     *
     * @param hostname the agent hostname to remove
     * @return {@code 204 No Content} on success, {@code 400} if no tenant is selected, {@code 403}
     *         if the tenant scope is denied (MSSP), {@code 404} if the host is not in the caller's
     *         tenant scope, {@code 500} on a backend outage.
     */
    @DeleteMapping("/agents/{hostname}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> deleteAgent(@PathVariable @NotNull String hostname) {
        final String ctx = CLASSNAME + ".deleteAgent";

        // Gate the tenant scope BEFORE the service call. deleteAgent() -> getAgentByHostname()
        // requires a tenant internally, but wraps a missing one into a generic RuntimeException
        // that would 500 here — so reject a scope-less removal up front with the honest status.
        // Only MSSP mode requires a concrete tenant: in a single-tenant (non-MSSP) deployment
        // getClientId() is legitimately null (no partitioning) and the removal must proceed, so
        // we mirror TenantScope.requireTenant()'s own MSSP-vs-single-tenant distinction rather
        // than a bare `clientId <= 0` check (which would wrongly 400 every single-tenant removal).
        Long tenantId = TenantContext.getClientId();
        if ((tenantId == null || tenantId <= 0) && TenantContext.isMssp()) {
            return ResponseEntity.badRequest().build();
        }

        eventService.createEvent(ctx + ": removal requested for host " + hostname,
                ApplicationEventType.AGENT_DELETE_ATTEMPT);
        try {
            agentGrpcService.deleteAgent(hostname);
            eventService.createEvent(ctx + ": host " + hostname + " removed from fleet",
                    ApplicationEventType.AGENT_DELETE_SUCCESS);
            return ResponseEntity.noContent().build();
        } catch (AgentNotfoundException nf) {
            // Not in the caller's tenant (or absent) → 404, no disclosure.
            return ResponseEntity.notFound().build();
        } catch (AccessDeniedException denied) {
            // MSSP: tenant scope could not be resolved for this caller → 403, not a fake outage.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }
}

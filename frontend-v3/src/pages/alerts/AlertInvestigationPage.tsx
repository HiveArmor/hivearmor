/**
 * Alert Investigation Board — synchronized attack story, process lineage,
 * evidence, and response context with progressive backend disclosure.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Binary,
  BookOpenCheck,
  Bot,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clipboard,
  Clock3,
  Copy,
  Crosshair,
  Database,
  ExternalLink,
  Eye,
  FileCode2,
  FileSearch,
  Fingerprint,
  GitBranch,
  Globe2,
  Hexagon,
  History,
  KeyRound,
  Link2,
  ListTree,
  Network,
  PanelTop,
  Play,
  Radio,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRound,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  enrichAlertWithAi,
  fetchAlertActivity,
  fetchAlertEventDetail,
  fetchAlertGuide,
  fetchAlertIndicators,
  fetchAlertInvestigation,
  fetchAlertNetwork,
  fetchAlertProcesses,
  fetchAlertRelated,
  fetchAlertRelationships,
  fetchAlertStory,
} from './alertInvestigation.service';
import type {
  AlertEventHighlightedResponse,
  AlertEventRawResponse,
  InvestigationIndicator,
  InvestigationProcess,
  InvestigationResponseAction,
  InvestigationSeverity,
  InvestigationStoryEvent,
  ProcessNode,
} from './alertInvestigation.types';
import { EntityGraphPanel } from './components/EntityGraphPanel';
import { LiveUpdateIndicator } from './components/LiveUpdateIndicator';
import { ResponseActionsPanel } from './components/ResponseActionsPanel';
import { SyntaxHighlightedJson } from './components/SyntaxHighlightedJson';
import { useInvestigationStream } from './hooks/useInvestigationStream';

import { ErrorState } from '@/components/error-state/ErrorState';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { foundationAlertInvestigation } from '@/pages/alerts/alertInvestigation.fixtures';
import { useAuthStore } from '@/store/auth.store';

import './AlertInvestigationPage.css';

type WorkspaceTab = 'board' | 'event' | 'history';
type EvidenceTab = 'network' | 'indicators' | 'related' | 'fields' | 'raw';
type NetworkSortKey = 'timestamp' | 'protocol' | 'direction' | 'sourceIp' | 'destIp' | 'bytesIn' | 'processName';
type SortDirection = 'asc' | 'desc';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const workspaceTabs: Array<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
  { id: 'board', label: 'Investigation board', icon: Workflow },
  { id: 'event', label: 'Event details', icon: Braces },
  { id: 'history', label: 'History & response', icon: History },
];

const evidenceTabs: Array<{ id: EvidenceTab; label: string; icon: LucideIcon }> = [
  { id: 'network', label: 'Network', icon: Network },
  { id: 'indicators', label: 'Indicators', icon: Fingerprint },
  { id: 'related', label: 'Related alerts', icon: Link2 },
  { id: 'fields', label: 'Fields', icon: ListTree },
  { id: 'raw', label: 'Raw event', icon: Braces },
];

const storyIcons: Record<InvestigationStoryEvent['category'], LucideIcon> = {
  process: TerminalSquare,
  file: FileCode2,
  network: Globe2,
  registry: KeyRound,
  identity: UserRound,
  detection: ShieldAlert,
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '—';
  const base = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${base}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function severityRank(severity: InvestigationSeverity): number {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[severity];
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function PanelHeading({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }): JSX.Element {
  return (
    <div className="alert-investigation-panel__header">
      <div>
        <Icon size={15} aria-hidden="true" />
        <h2>{title}</h2>
      </div>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="alert-copy-button" type="button" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="alert-investigation-metric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProcessTree({
  processes,
  selectedId,
  onSelect,
}: {
  processes: InvestigationProcess[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(processes.map((process) => process.id)));
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, InvestigationProcess[]>();
    processes.forEach((process) => {
      const siblings = map.get(process.parentId) ?? [];
      siblings.push(process);
      map.set(process.parentId, siblings);
    });
    return map;
  }, [processes]);

  useEffect(() => {
    if (!selectedId) return;
    setExpanded((currentExpanded) => {
      const next = new Set(currentExpanded);
      let changed = false;
      let current = processes.find((process) => process.id === selectedId);
      while (current?.parentId) {
        if (!next.has(current.parentId)) {
          next.add(current.parentId);
          changed = true;
        }
        current = processes.find((process) => process.id === current?.parentId);
      }
      return changed ? next : currentExpanded;
    });
  }, [selectedId, processes]);

  const renderBranch = (parentId: string | null, depth: number): JSX.Element[] => {
    return (childrenByParent.get(parentId) ?? []).flatMap((process) => {
      const children = childrenByParent.get(process.id) ?? [];
      const isExpanded = expanded.has(process.id);
      const row = (
        <li key={process.id} className="process-tree__item">
          <button
            type="button"
            className="process-tree__row"
            data-selected={selectedId === process.id}
            data-verdict={process.verdict}
            style={{ '--process-depth': depth } as CSSProperties}
            aria-expanded={children.length > 0 ? isExpanded : undefined}
            onClick={() => {
              onSelect(process.id);
              if (children.length > 0) {
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(process.id)) next.delete(process.id);
                  else next.add(process.id);
                  return next;
                });
              }
            }}
          >
            <span
              className="process-tree__toggle"
              aria-hidden="true"
            >
              {children.length > 0
                ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                : <CircleDot size={9} />}
            </span>
            <span className="process-tree__node"><Hexagon size={14} aria-hidden="true" /></span>
            <span className="process-tree__identity">
              <strong>{process.name}</strong>
              <small>PID {process.pid} · {formatTime(process.startedAt)}</small>
            </span>
            <span className="process-verdict" data-verdict={process.verdict}>{process.verdict}</span>
          </button>
          {selectedId === process.id && (
            <div className="process-tree__detail" style={{ '--process-depth': depth } as CSSProperties}>
              <span>{process.user}</span>
              <code>{process.commandLine}</code>
              <span>{process.signed === null ? 'Signature unknown' : process.signed ? 'Digitally signed' : 'Unsigned'}</span>
            </div>
          )}
        </li>
      );
      return isExpanded ? [row, ...renderBranch(process.id, depth + 1)] : [row];
    });
  };

  if (processes.length === 0) {
    return <DataUnavailable label="Process lineage" contract="ALT-003" />;
  }

  return <ul className="process-tree" aria-label="Expandable process lineage">{renderBranch(null, 0)}</ul>;
}

function DataUnavailable({ label, contract }: { label: string; contract: string }): JSX.Element {
  return (
    <div className="alert-data-unavailable">
      <Database size={18} aria-hidden="true" />
      <div>
        <strong>{label} unavailable</strong>
        <span>Awaiting backend contract {contract}. No evidence was inferred.</span>
      </div>
    </div>
  );
}

function PanelSkeleton(): JSX.Element {
  return (
    <div className="alert-investigation-skeleton" style={{ height: '6rem' }} aria-busy="true" aria-label="Loading panel data" />
  );
}

/* --- Telemetry: Process Tree (recursive) --- */

function ProcessTreeNode({
  node,
  alertProcessIds,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  node: ProcessNode;
  alertProcessIds: string[];
  selectedId: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}): JSX.Element {
  const isAlert = alertProcessIds.includes(node.id);
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <li className="process-tree__item">
      <button
        type="button"
        className="process-tree__row"
        data-selected={selectedId === node.id}
        data-verdict={node.verdict}
        style={{
          '--process-depth': node.depth,
          borderLeft: isAlert ? '3px solid var(--ha-severity-critical)' : undefined,
        } as CSSProperties}
        aria-expanded={hasChildren ? isExpanded : undefined}
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) onToggle(node.id);
        }}
      >
        <span className="process-tree__toggle" aria-hidden="true">
          {hasChildren
            ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
            : <CircleDot size={9} />}
        </span>
        <span className="process-tree__node"><Hexagon size={14} aria-hidden="true" /></span>
        <span className="process-tree__identity">
          <strong>{node.name}</strong>
          <small>PID {node.pid} · {formatTime(node.startTime)}</small>
        </span>
        <span className="process-verdict" data-verdict={node.verdict}>{node.verdict}</span>
      </button>
      {selectedId === node.id && (
        <div className="process-tree__detail" style={{ '--process-depth': node.depth } as CSSProperties}>
          <span>{node.user}</span>
          <code>{node.commandLine}</code>
          <span>{node.signature.signed ? `Signed by ${node.signature.signer ?? 'unknown'}${node.signature.verified ? ' (verified)' : ''}` : 'Unsigned'}</span>
          <span className="process-verdict" data-verdict={node.verdict}>{node.verdict}</span>
        </div>
      )}
      {hasChildren && isExpanded && (
        <ul className="process-tree">
          {node.children.map((child) => (
            <ProcessTreeNode
              key={child.id}
              node={child}
              alertProcessIds={alertProcessIds}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TelemetryProcessTree({
  tree,
  alertProcessIds,
  selectedId,
  onSelect,
}: {
  tree: ProcessNode[];
  alertProcessIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Start with all nodes expanded
    const ids = new Set<string>();
    const walk = (nodes: ProcessNode[]): void => {
      nodes.forEach((n) => { ids.add(n.id); walk(n.children); });
    };
    walk(tree);
    return ids;
  });

  const toggle = (id: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (tree.length === 0) {
    return <DataUnavailable label="Process lineage" contract="ALT-003" />;
  }

  return (
    <ul className="process-tree" aria-label="Expandable process lineage">
      {tree.map((root) => (
        <ProcessTreeNode
          key={root.id}
          node={root}
          alertProcessIds={alertProcessIds}
          selectedId={selectedId}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={toggle}
        />
      ))}
    </ul>
  );
}

/* --- Telemetry: IOC type icon helper --- */

function IocTypeIcon({ type }: { type: string }): JSX.Element {
  switch (type) {
    case 'ipv4': case 'ip': return <Globe2 size={13} aria-hidden="true" />;
    case 'domain': return <Network size={13} aria-hidden="true" />;
    case 'sha256': case 'sha1': case 'md5': return <Fingerprint size={13} aria-hidden="true" />;
    case 'url': return <Link2 size={13} aria-hidden="true" />;
    case 'registry_key': return <KeyRound size={13} aria-hidden="true" />;
    default: return <FileSearch size={13} aria-hidden="true" />;
  }
}

function verdictColor(verdict: string): string {
  switch (verdict) {
    case 'malicious': return 'var(--ha-severity-critical)';
    case 'suspicious': return 'var(--ha-severity-high)';
    case 'benign': return 'var(--ha-severity-low)';
    default: return 'var(--ha-severity-info)';
  }
}

function correlationStrengthColor(strength: string): string {
  switch (strength) {
    case 'strong': return 'var(--ha-severity-high)';
    case 'moderate': return 'var(--ha-severity-medium)';
    case 'weak': return 'var(--ha-severity-low)';
    default: return 'var(--ha-severity-info)';
  }
}

function AlertInvestigationSkeleton(): JSX.Element {
  return (
    <div className="alert-investigation alert-investigation--loading" aria-busy="true" aria-label="Loading alert investigation">
      <div className="alert-investigation-skeleton alert-investigation-skeleton--header" />
      <div className="alert-investigation-skeleton-grid">
        <div className="alert-investigation-skeleton" />
        <div className="alert-investigation-skeleton" />
        <div className="alert-investigation-skeleton" />
      </div>
    </div>
  );
}

export function AlertInvestigationPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);
  const canAskHive = useAuthStore((state) => state.hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']));
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('board');
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>('network');
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<InvestigationResponseAction | null>(null);
  const [fixtureActionResult, setFixtureActionResult] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<string | undefined>(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const enrichMutation = useMutation({
    mutationFn: () => enrichAlertWithAi(id),
    onSuccess: (result) => {
      setAiSummary(result.summary);
      addToast({
        variant: 'success',
        title: 'Hive enrichment ready',
        description: result.summary.slice(0, 180) || 'Enrichment completed.',
      });
    },
    onError: (error: Error) => {
      addToast({
        variant: 'danger',
        title: 'Ask Hive failed',
        description: error.message,
      });
    },
  });

  const investigationQuery = useQuery({
    queryKey: ['alert-investigation', id],
    queryFn: () => fixtureMode
      ? Promise.resolve({ ...foundationAlertInvestigation, id: id || foundationAlertInvestigation.id })
      : fetchAlertInvestigation(id),
    enabled: Boolean(id),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const investigation = investigationQuery.data;

  // Sub-resource queries (8.1–8.5)
  const storyQuery = useQuery({
    queryKey: ['alert-story', id],
    queryFn: () => fixtureMode
      ? Promise.resolve({ stages: foundationAlertInvestigation.stages, items: foundationAlertInvestigation.story })
      : fetchAlertStory(id),
    enabled: Boolean(id) && (fixtureMode || workspaceTab !== 'history'),
    staleTime: 60_000,
  });

  const guideQuery = useQuery({
    queryKey: ['alert-guide', id],
    queryFn: () => fixtureMode
      ? Promise.resolve({
          alertReason: foundationAlertInvestigation.rule.reason,
          ruleDescription: foundationAlertInvestigation.summary,
          steps: foundationAlertInvestigation.rule.investigationGuide,
          mitre: null,
        })
      : fetchAlertGuide(id),
    enabled: Boolean(id) && (guideOpen || workspaceTab === 'event'),
    staleTime: 5 * 60_000,
  });

  const activityQuery = useQuery({
    queryKey: ['alert-activity', id, activityCursor],
    queryFn: () => fixtureMode
      ? Promise.resolve({ items: foundationAlertInvestigation.history, nextCursor: null, hasMore: false })
      : fetchAlertActivity(id, activityCursor),
    enabled: workspaceTab === 'history',
  });

  const eventHighlightedQuery = useQuery({
    queryKey: ['alert-event', id, selectedEventId, 'highlighted'],
    queryFn: () => {
      if (fixtureMode) {
        return Promise.resolve({
          fields: Object.entries(foundationAlertInvestigation.highlightedFields).map(([key, value], order) => ({
            key,
            value,
            type: 'string' as const,
            emphasis: 'neutral' as const,
            order,
          })),
        });
      }
      if (!selectedEventId) throw new Error('An event must be selected before loading highlighted fields.');
      return fetchAlertEventDetail(id, selectedEventId, 'highlighted');
    },
    enabled: workspaceTab === 'event' && Boolean(selectedEventId),
  });

  const eventRawQuery = useQuery({
    queryKey: ['alert-event', id, selectedEventId, 'raw'],
    queryFn: () => {
      if (fixtureMode) return Promise.resolve({ raw: foundationAlertInvestigation.rawEvent });
      if (!selectedEventId) throw new Error('An event must be selected before loading raw data.');
      return fetchAlertEventDetail(id, selectedEventId, 'raw');
    },
    enabled: workspaceTab === 'event' && Boolean(selectedEventId),
  });

  // --- Telemetry queries (9.1–9.4) ---
  const processQuery = useQuery({
    queryKey: ['alert-processes', id],
    queryFn: () => fetchAlertProcesses(id),
    enabled: Boolean(id) && !fixtureMode && workspaceTab === 'board',
    staleTime: 60_000,
  });

  const networkQuery = useQuery({
    queryKey: ['alert-network', id],
    queryFn: () => fetchAlertNetwork(id),
    enabled: Boolean(id) && !fixtureMode && workspaceTab === 'board' && evidenceTab === 'network',
    staleTime: 60_000,
  });

  const indicatorsQuery = useQuery({
    queryKey: ['alert-indicators', id],
    queryFn: () => fetchAlertIndicators(id),
    enabled: Boolean(id) && !fixtureMode && workspaceTab === 'board',
    staleTime: 60_000,
  });

  const relatedQuery = useQuery({
    queryKey: ['alert-related', id],
    queryFn: () => fetchAlertRelated(id),
    enabled: Boolean(id) && !fixtureMode && workspaceTab === 'board' && evidenceTab === 'related',
    staleTime: 2 * 60_000,
  });

  // --- SSE live update stream (ALT-012) ---
  const streamStatus = useInvestigationStream(fixtureMode ? undefined : (id || undefined));

  // --- Entity graph query (ALT-006) ---
  const relationshipsQuery = useQuery({
    queryKey: ['alert-relationships', id],
    queryFn: () => fixtureMode
      ? Promise.resolve({
          nodes: foundationAlertInvestigation.entities.map((entity) => ({
            id: entity.id,
            type: entity.type,
            label: entity.label,
            role: entity.role,
            riskScore: entity.riskScore ?? 0,
            metadata: { evidenceCount: entity.evidenceCount },
          })),
          edges: [],
          metadata: { totalNodes: foundationAlertInvestigation.entities.length, totalEdges: 0, truncated: false },
        })
      : fetchAlertRelationships(id),
    enabled: Boolean(id) && workspaceTab === 'board',
    staleTime: 2 * 60_000,
  });

  // --- Network sorting state (9.8) ---
  const [networkSortKey, setNetworkSortKey] = useState<NetworkSortKey>('timestamp');
  const [networkSortDir, setNetworkSortDir] = useState<SortDirection>('asc');

  const sortedConnections = useMemo(() => {
    const connections = networkQuery.data?.connections ?? [];
    const sorted = [...connections].sort((a, b) => {
      const av = a[networkSortKey];
      const bv = b[networkSortKey];
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return networkSortDir === 'desc' ? sorted.reverse() : sorted;
  }, [networkQuery.data?.connections, networkSortKey, networkSortDir]);
  const priorityIndicators = useMemo<InvestigationIndicator[]>(() => {
    if (!indicatorsQuery.data) return investigation?.indicators ?? [];
    return indicatorsQuery.data.indicators.map((indicator) => {
      const type: InvestigationIndicator['type'] = indicator.type === 'ipv4'
        ? 'ip'
        : indicator.type === 'registry_key'
          ? 'registry'
          : indicator.type as InvestigationIndicator['type'];
      return {
        id: indicator.id,
        type,
        value: indicator.value,
        verdict: indicator.verdict === 'benign' ? 'trusted' : (indicator.verdict ?? 'unknown'),
        confidence: indicator.confidence ?? null,
        source: indicator.sources.join(', ') || 'Observed event',
        firstSeen: indicator.firstSeen,
        lastSeen: indicator.lastSeen,
        evidenceIds: [],
      };
    });
  }, [indicatorsQuery.data, investigation?.indicators]);

  const handleNetworkSort = (key: NetworkSortKey): void => {
    if (networkSortKey === key) {
      setNetworkSortDir((dir) => dir === 'asc' ? 'desc' : 'asc');
    } else {
      setNetworkSortKey(key);
      setNetworkSortDir('asc');
    }
  };
  const sortedStory = useMemo(
    () => [...(storyQuery.data?.items ?? investigation?.story ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [storyQuery.data?.items, investigation?.story]
  );
  const selectedStory = sortedStory.find((event) => event.id === selectedStoryId) ?? sortedStory[0] ?? null;
  const selectedProcess = investigation?.processes.find((process) => process.id === selectedProcessId) ?? null;
  const sortedCapabilities = useMemo(
    () => [...(investigation?.capabilities ?? [])].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    [investigation?.capabilities]
  );
  const filteredFields = useMemo(() => {
    const entries = Object.entries(investigation?.highlightedFields ?? {});
    if (!fieldSearch.trim()) return entries;
    const needle = fieldSearch.toLowerCase();
    return entries.filter(([field, value]) => `${field} ${value}`.toLowerCase().includes(needle));
  }, [fieldSearch, investigation?.highlightedFields]);

  // 8.6/8.12: Derived stages from story query, dataCompleteness logic
  const stages = storyQuery.data?.stages ?? investigation?.stages ?? [];
  const dataCompleteness = (processQuery.isSuccess && networkQuery.isSuccess)
    ? 'extended'
    : storyQuery.isSuccess && (storyQuery.data?.stages.length ?? 0) > 0
      ? 'full'
      : investigation?.dataCompleteness ?? 'core';
  const showMissingDataNotice = dataCompleteness === 'core' && Boolean(investigation?.missingDataNotice);

  useEffect(() => {
    if (!selectedStoryId && sortedStory[0]) setSelectedStoryId(sortedStory[0].id);
  }, [selectedStoryId, sortedStory]);

  useEffect(() => {
    if (selectedStory?.processId) setSelectedProcessId(selectedStory.processId);
  }, [selectedStory]);

  // 8.10: When selectedStoryId changes and tab is 'event', set selectedEventId
  useEffect(() => {
    if (workspaceTab === 'event' && selectedStoryId) {
      setSelectedEventId(selectedStoryId);
    }
  }, [selectedStoryId, workspaceTab]);

  // Auto-select first story event when switching to 'event' tab without a selection
  useEffect(() => {
    if (workspaceTab === 'event' && !selectedEventId && storyQuery.data?.items?.length) {
      setSelectedEventId(storyQuery.data.items[0].id);
    }
  }, [workspaceTab, selectedEventId, storyQuery.data]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target) || workspaceTab !== 'board' || sortedStory.length === 0) return;
      const currentIndex = Math.max(0, sortedStory.findIndex((item) => item.id === selectedStory?.id));
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setSelectedStoryId(sortedStory[Math.min(sortedStory.length - 1, currentIndex + 1)].id);
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSelectedStoryId(sortedStory[Math.max(0, currentIndex - 1)].id);
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [selectedStory?.id, sortedStory, workspaceTab]);

  const handleWorkspaceKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tabIndex: number): void => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (tabIndex + delta + workspaceTabs.length) % workspaceTabs.length;
    setWorkspaceTab(workspaceTabs[nextIndex].id);
    document.getElementById(`alert-workspace-tab-${workspaceTabs[nextIndex].id}`)?.focus();
  };

  if (!id) {
    return <ErrorState title="Alert ID required" message="Open an alert from the alert queue to start an investigation." />;
  }
  if (investigationQuery.isLoading) return <AlertInvestigationSkeleton />;
  if (investigationQuery.isError || !investigation) {
    return (
      <div className="alert-investigation alert-investigation--error">
        <ErrorState
          title="Investigation could not be loaded"
          message="The alert detail contract is unavailable or this alert is outside your tenant scope. No cached evidence is being shown."
          error={investigationQuery.error as Error}
          onRetry={() => void investigationQuery.refetch()}
        />
        <button className="alert-text-button" type="button" onClick={() => navigate('/alerts')}>
          <ArrowLeft size={14} aria-hidden="true" /> Return to alerts
        </button>
      </div>
    );
  }

  const primaryAction = investigation.actions.find((action) => action.id === 'block_indicators' || action.id === 'block-indicators')
    ?? investigation.actions.find((action) => action.available)
    ?? investigation.actions[0];

  const openResponseConsole = (action?: InvestigationResponseAction): void => {
    if (fixtureMode && action) {
      setPendingAction(action);
      return;
    }
    setWorkspaceTab('history');
    window.requestAnimationFrame(() => {
      document.getElementById('alert-workspace-panel-history')?.scrollIntoView({ block: 'start' });
    });
  };

  return (
    <div className="alert-investigation">
      {fixtureMode && (
        <div className="alert-investigation__fixture-notice" role="status">
          <span><strong>Design fixture:</strong> fictional telemetry is enabled for visual review.</span>
          <span>Production never receives these records.</span>
        </div>
      )}

      <header className="alert-investigation-header">
        <div className="alert-investigation-header__utility">
          <button className="alert-icon-button" type="button" onClick={() => navigate('/alerts')} aria-label="Back to alerts" title="Back to alerts">
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
          <div className="alert-investigation-header__breadcrumb">
            <span>Detections</span><ChevronRight size={12} aria-hidden="true" /><span>Alerts</span><ChevronRight size={12} aria-hidden="true" /><strong>Investigation</strong>
          </div>
          <div className="alert-investigation-header__freshness"><Radio size={12} aria-hidden="true" /> Updated {formatDateTime(investigation.updatedAt)}</div>
          <LiveUpdateIndicator status={streamStatus.status} />
        </div>

        <div className="alert-investigation-header__main">
          <div className="alert-investigation-header__identity">
            <div className="alert-severity-beacon" data-severity={investigation.severity} aria-hidden="true"><Hexagon size={30} /></div>
            <div>
              <div className="alert-investigation-header__eyebrow">
                <span className="severity-label" data-severity={investigation.severity}>{titleCase(investigation.severity)}</span>
                <span>{titleCase(investigation.status)}</span>
                <span className="alert-id">{investigation.id}</span>
                <CopyButton value={investigation.id} label="alert ID" />
              </div>
              <h1>{investigation.title}</h1>
              <p>{investigation.summary}</p>
            </div>
          </div>
          <div className="alert-investigation-header__actions">
            <button className="alert-command-button" type="button" onClick={() => setGuideOpen((open) => !open)}>
              <BookOpenCheck size={15} aria-hidden="true" /> Guide
            </button>
            <button
              className="alert-command-button"
              type="button"
              disabled={!canAskHive || enrichMutation.isPending || !id}
              title={canAskHive ? 'Enrich this alert with Hive Intelligence' : 'Required permission: Analyst'}
              onClick={() => {
                if (fixtureMode) {
                  setAiSummary('Fixture mode: Ask Hive is simulated and no model was called.');
                  return;
                }
                enrichMutation.mutate();
              }}
            >
              <Bot size={15} aria-hidden="true" /> {enrichMutation.isPending ? 'Asking…' : 'Ask Hive'}
            </button>
            {primaryAction && (
              <button
                className="alert-command-button alert-command-button--primary"
                type="button"
                disabled={!primaryAction.available}
                title={primaryAction.unavailableReason ?? primaryAction.description}
                onClick={() => openResponseConsole(primaryAction)}
              >
                <Shield size={15} aria-hidden="true" /> {primaryAction.label}
              </button>
            )}
          </div>
        </div>

        <div className="alert-investigation-header__context">
          <Metric label="Risk" value={investigation.riskScore === null ? '—' : `${investigation.riskScore}/100`} tone={investigation.severity} />
          <Metric label="Confidence" value={investigation.confidence === null ? '—' : `${investigation.confidence}%`} />
          <Metric label="Verdict" value={titleCase(investigation.verdict)} tone={investigation.verdict === 'malicious' ? 'critical' : undefined} />
          <Metric label="Asset" value={investigation.asset ?? 'Unmapped'} />
          <Metric label="Tenant" value={investigation.tenant ?? 'Current tenant'} />
          <Metric label="Detected" value={formatDateTime(investigation.occurredAt)} />
          <Metric label="SLA" value={investigation.slaDeadline ? formatDateTime(investigation.slaDeadline) : 'Not set'} />
        </div>

        {aiSummary && (
          <section className="investigation-guide" aria-label="Ask Hive enrichment">
            <div>
              <Bot size={17} aria-hidden="true" />
              <div><strong>Ask Hive</strong><span>SOC AI enrichment</span></div>
            </div>
            <p style={{ margin: 0, color: 'var(--ha-text-secondary)', font: 'var(--ha-type-compact)' }}>{aiSummary}</p>
            <button className="alert-icon-button" type="button" onClick={() => setAiSummary(null)} aria-label="Dismiss Ask Hive result"><X size={15} /></button>
          </section>
        )}

        {guideOpen && (
          <section className="investigation-guide" aria-label="Investigation guide">
            <div>
              <BookOpenCheck size={17} aria-hidden="true" />
              <div><strong>Rule-guided investigation</strong><span>{investigation.rule.name ?? 'Detection rule'}</span></div>
            </div>
            {guideQuery.isLoading ? (
              <div className="alert-investigation-skeleton" style={{ height: '4rem' }} aria-busy="true" aria-label="Loading investigation guide" />
            ) : (guideQuery.data?.steps ?? investigation.rule.investigationGuide).length > 0 ? (
              <ol>{(guideQuery.data?.steps ?? investigation.rule.investigationGuide).map((step) => <li key={step}>{step}</li>)}</ol>
            ) : <DataUnavailable label="Investigation guide" contract="ALT-009" />}
            <button className="alert-icon-button" type="button" onClick={() => setGuideOpen(false)} aria-label="Close investigation guide"><X size={15} /></button>
          </section>
        )}
      </header>

      {showMissingDataNotice && (
        <div className="alert-investigation__contract-notice" role="status">
          <Database size={15} aria-hidden="true" />
          <span>{investigation.missingDataNotice}</span>
          <span>Contract register: ALT-001–ALT-012</span>
        </div>
      )}

      <nav className="alert-investigation-tabs" aria-label="Alert investigation views">
        <div className="alert-investigation-tabs__list" role="tablist">
          {workspaceTabs.map(({ id: tabId, label, icon: Icon }, index) => (
            <button
              key={tabId}
              id={`alert-workspace-tab-${tabId}`}
              type="button"
              role="tab"
              aria-selected={workspaceTab === tabId}
              aria-controls={`alert-workspace-panel-${tabId}`}
              tabIndex={workspaceTab === tabId ? 0 : -1}
              data-active={workspaceTab === tabId}
              onClick={() => setWorkspaceTab(tabId)}
              onKeyDown={(event) => handleWorkspaceKeyDown(event, index)}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className="alert-investigation-tabs__spacer" />
        <div className="alert-shortcuts">
          <button className="alert-text-button" type="button" onClick={() => setShortcutsOpen((open) => !open)} aria-expanded={shortcutsOpen}>
            <Zap size={13} aria-hidden="true" /> Shortcuts
          </button>
          {shortcutsOpen && (
            <div className="alert-shortcuts__popover" role="dialog" aria-label="Keyboard shortcuts">
              <strong>Board navigation</strong>
              <span><kbd>J</kbd> Next event</span><span><kbd>K</kbd> Previous event</span>
              <span><kbd>←</kbd><kbd>→</kbd> Change workspace tab</span>
            </div>
          )}
        </div>
      </nav>

      {workspaceTab === 'board' && (
        <main id="alert-workspace-panel-board" role="tabpanel" aria-labelledby="alert-workspace-tab-board" className="alert-investigation-board">
          <section className="attack-chain" aria-labelledby="attack-chain-title">
            <div className="attack-chain__label"><Crosshair size={15} aria-hidden="true" /><div><strong id="attack-chain-title">Attack chain</strong><span>Observed evidence by ATT&amp;CK tactic</span></div></div>
            {storyQuery.isLoading ? (
              <div className="alert-investigation-skeleton" style={{ height: '3rem' }} aria-busy="true" aria-label="Loading attack chain" />
            ) : storyQuery.isError ? (
              <DataUnavailable label="Attack-chain mapping" contract="ALT-002" />
            ) : stages.length > 0 ? (
              <ol className="attack-chain__stages">
                {stages.map((stage, index) => (
                  <li key={stage.id} data-state={stage.state}>
                    <button type="button" onClick={() => {
                      const event = sortedStory.find((item) => item.stageId === stage.id);
                      if (event) setSelectedStoryId(event.id);
                    }} disabled={stage.eventCount === 0}>
                      <span className="attack-chain__hex"><Hexagon size={22} aria-hidden="true" /><b>{index + 1}</b></span>
                      <span><strong>{stage.label}</strong><small>{stage.technique}</small></span>
                      <em>{stage.eventCount}</em>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <DataUnavailable label="Attack-chain mapping" contract="ALT-002" />}
          </section>

          <div className="alert-investigation-board__grid">
            <aside className="alert-investigation-board__left">
              <section className="alert-investigation-panel">
                <PanelHeading icon={Eye} title="Why it fired" />
                <div className="alert-investigation-panel__body detection-reason">
                  <p>{guideQuery.data?.alertReason ?? investigation.rule.reason}</p>
                  <dl>
                    <div><dt>Rule</dt><dd>{investigation.rule.name ?? 'Not provided'}</dd></div>
                    <div><dt>Detector</dt><dd>{investigation.detector}</dd></div>
                    <div><dt>Source</dt><dd>{investigation.dataSource}</dd></div>
                  </dl>
                </div>
              </section>

              <section className="alert-investigation-panel">
                <PanelHeading icon={Sparkles} title="Observed capabilities" meta={sortedCapabilities.length > 0 ? `${sortedCapabilities.length}` : undefined} />
                <div className="alert-investigation-panel__body capability-list">
                  {sortedCapabilities.length > 0 ? sortedCapabilities.map((capability) => (
                    <article key={capability.id} data-severity={capability.severity}>
                      <span><Hexagon size={15} aria-hidden="true" /></span>
                      <div><strong>{capability.label}</strong><p>{capability.description}</p><small>{capability.evidenceCount} evidence items</small></div>
                    </article>
                  )) : <DataUnavailable label="Behavior capability analysis" contract="ALT-008" />}
                </div>
              </section>

              <section className="alert-investigation-panel">
                <PanelHeading icon={PanelTop} title="Investigation scope" meta={investigation.entities.length > 0 ? `${investigation.entities.length} entities` : undefined} />
                <div className="alert-investigation-panel__body entity-scope-list">
                  {investigation.entities.map((entity) => (
                    <button key={entity.id} type="button" title={`Open ${entity.type} pivot when entity routes are connected`}>
                      <span className="entity-scope-list__icon"><Hexagon size={15} aria-hidden="true" /></span>
                      <span><strong>{entity.label}</strong><small>{entity.type} · {entity.role}</small></span>
                      <em>{entity.riskScore ?? '—'}</em>
                    </button>
                  ))}
                </div>
              </section>
            </aside>

            <section className="alert-investigation-board__canvas" aria-label="Synchronized investigation canvas">
              <div className="investigation-canvas-toolbar">
                <div><Workflow size={16} aria-hidden="true" /><div><strong>Execution story</strong><span>Select an event to synchronize process and evidence context</span></div></div>
                <div><kbd>J</kbd><kbd>K</kbd><span>navigate</span></div>
              </div>
              <div className="investigation-canvas__split">
                <section className="story-lane" aria-label="Ordered execution story">
                  {storyQuery.isLoading ? (
                    <div className="alert-investigation-skeleton" style={{ height: '10rem' }} aria-busy="true" aria-label="Loading execution story" />
                  ) : storyQuery.isError ? (
                    <DataUnavailable label="Execution story" contract="ALT-002" />
                  ) : sortedStory.length > 0 ? (
                    <ol>
                      {sortedStory.map((event, index) => {
                        const Icon = storyIcons[event.category];
                        return (
                          <li key={event.id}>
                            <button type="button" data-selected={selectedStory?.id === event.id} data-severity={event.severity} onClick={() => setSelectedStoryId(event.id)}>
                              <span className="story-lane__time">{formatTime(event.timestamp)}</span>
                              <span className="story-lane__track"><i>{index + 1}</i></span>
                              <span className="story-lane__event-icon"><Icon size={14} aria-hidden="true" /></span>
                              <span className="story-lane__copy"><strong>{event.title}</strong><small>{event.summary}</small><em>{event.source}</em></span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : <DataUnavailable label="Execution story" contract="ALT-002" />}
                </section>

                <section className="process-lane" aria-label="Process lineage panel">
                  <div className="process-lane__header"><div><GitBranch size={15} aria-hidden="true" /><strong>Process lineage</strong></div><span>{processQuery.isError && investigation.processes.length === 0 ? '—' : `${processQuery.data?.totalProcesses ?? investigation.processes.length} processes`}</span></div>
                  {processQuery.isLoading ? (
                    <PanelSkeleton />
                  ) : processQuery.isError && investigation.processes.length === 0 ? (
                    <DataUnavailable label="Process lineage" contract="ALT-003" />
                  ) : processQuery.data && processQuery.data.tree.length > 0 ? (
                    <TelemetryProcessTree
                      tree={processQuery.data.tree}
                      alertProcessIds={processQuery.data.alertProcessIds}
                      selectedId={selectedProcessId}
                      onSelect={setSelectedProcessId}
                    />
                  ) : (
                    <ProcessTree processes={investigation.processes} selectedId={selectedProcessId} onSelect={setSelectedProcessId} />
                  )}
                </section>
              </div>
              {selectedStory && (
                <div className="investigation-selection" aria-live="polite">
                  <div><span>Selected evidence</span><strong>{selectedStory.title}</strong></div>
                  <div><span>Stage</span><strong>{stages.find((stage) => stage.id === selectedStory.stageId)?.label ?? 'Correlation'}</strong></div>
                  <div><span>Process</span><strong>{selectedProcess?.name ?? 'No process'}</strong></div>
                  <div><span>Evidence</span><strong>{selectedStory.evidenceIds.length}</strong></div>
                </div>
              )}
            </section>

            <aside className="alert-investigation-board__right">
              <section className="alert-investigation-panel alert-investigation-panel--intel">
                <PanelHeading icon={Fingerprint} title="Priority indicators" meta={priorityIndicators.length > 0 ? `${priorityIndicators.length}` : undefined} />
                <div className="alert-investigation-panel__body indicator-list">
                  {priorityIndicators.length > 0 ? priorityIndicators.slice(0, 4).map((indicator) => (
                    <article key={indicator.id} data-verdict={indicator.verdict}>
                      <div><span>{indicator.type}</span><em>{indicator.verdict}</em></div>
                      <div className="indicator-list__value"><code title={indicator.value}>{indicator.value}</code><CopyButton value={indicator.value} label={`${indicator.type} indicator`} /></div>
                      <small>{indicator.source} · {indicator.confidence === null ? 'confidence unknown' : `${indicator.confidence}% confidence`}</small>
                    </article>
                  )) : <DataUnavailable label="Enriched indicators" contract="ALT-005" />}
                </div>
              </section>

              <section className="alert-investigation-panel alert-investigation-panel--response">
                <PanelHeading icon={ShieldCheck} title="Response console" />
                <div className="alert-investigation-panel__body response-action-list">
                  {investigation.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      data-tone={action.tone}
                      disabled={!action.available}
                      title={action.unavailableReason ?? action.description}
                      onClick={() => openResponseConsole(action)}
                    >
                      <span>{action.tone === 'danger' ? <ShieldAlert size={15} /> : action.tone === 'primary' ? <ShieldCheck size={15} /> : <Clipboard size={15} />}</span>
                      <span><strong>{action.label}</strong><small>{action.target}</small></span>
                      <Play size={12} aria-hidden="true" />
                    </button>
                  ))}
                  <p className="response-action-list__safety"><Shield size={13} aria-hidden="true" /> All disruptive actions require target preview, authorization, and confirmation.</p>
                  {fixtureActionResult && <p className="response-action-list__result" role="status"><Check size={13} /> {fixtureActionResult}</p>}
                </div>
              </section>
            </aside>
          </div>

          <section className="alert-investigation-panel" aria-label="Entity relationship graph">
            <PanelHeading icon={Network} title="Entity graph" meta={relationshipsQuery.data ? `${relationshipsQuery.data.metadata.totalNodes} nodes` : undefined} />
            <div className="alert-investigation-panel__body" style={{ padding: 0 }}>
              <EntityGraphPanel
                data={relationshipsQuery.data}
                isLoading={relationshipsQuery.isLoading}
                isError={relationshipsQuery.isError}
                onRetry={() => void relationshipsQuery.refetch()}
              />
            </div>
          </section>

          <section className="evidence-dock">
            <div className="evidence-dock__header">
              <div><Database size={15} aria-hidden="true" /><strong>Evidence dock</strong></div>
              <nav aria-label="Evidence categories">
                {evidenceTabs.map(({ id: tabId, label, icon: Icon }) => (
                  <button key={tabId} type="button" data-active={evidenceTab === tabId} onClick={() => setEvidenceTab(tabId)}>
                    <Icon size={13} aria-hidden="true" /> {label}
                    {tabId === 'network' && <span>{networkQuery.isLoading ? '…' : networkQuery.isError ? '—' : (networkQuery.data?.totalConnections ?? investigation.network.length)}</span>}
                    {tabId === 'indicators' && <span>{indicatorsQuery.isLoading ? '…' : indicatorsQuery.isError ? '—' : (indicatorsQuery.data?.totalCount ?? investigation.indicators.length)}</span>}
                    {tabId === 'related' && <span>{relatedQuery.isLoading ? '…' : relatedQuery.isError ? '—' : (relatedQuery.data?.totalCount ?? investigation.relatedAlerts.length)}</span>}
                  </button>
                ))}
              </nav>
            </div>
            <div className="evidence-dock__body">
              {evidenceTab === 'network' && (
                networkQuery.isLoading ? <PanelSkeleton /> :
                networkQuery.isError ? <DataUnavailable label="Network activity" contract="ALT-004" /> :
                (sortedConnections.length > 0 || (networkQuery.data?.dns ?? []).length > 0) ? (
                  <div className="evidence-table-wrap">
                    {/* Connections table — sortable */}
                    <table className="evidence-table">
                      <thead><tr>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('timestamp')}>Time{networkSortKey === 'timestamp' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('protocol')}>Protocol{networkSortKey === 'protocol' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('direction')}>Direction{networkSortKey === 'direction' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('sourceIp')}>Source{networkSortKey === 'sourceIp' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('destIp')}>Destination{networkSortKey === 'destIp' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('bytesIn')}>Bytes{networkSortKey === 'bytesIn' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleNetworkSort('processName')}>Process{networkSortKey === 'processName' ? (networkSortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                        <th>Reputation</th>
                      </tr></thead>
                      <tbody>{sortedConnections.map((conn) => {
                        const rep = networkQuery.data?.reputation?.[conn.destIp];
                        return (
                          <tr key={conn.id}>
                            <td>{formatTime(conn.timestamp)}</td>
                            <td>{conn.protocol}</td>
                            <td>{conn.direction}</td>
                            <td><code>{conn.sourceIp}:{conn.sourcePort}</code></td>
                            <td><code>{conn.destIp}:{conn.destPort}</code><CopyButton value={conn.destIp} label="destination IP" /></td>
                            <td>{(conn.bytesIn + conn.bytesOut).toLocaleString()}</td>
                            <td>{conn.processName}</td>
                            <td>{rep ? (
                              <span className="table-verdict" style={{ color: rep.score >= 80 ? 'var(--ha-severity-critical)' : rep.score >= 50 ? 'var(--ha-severity-high)' : 'var(--ha-severity-medium)' }}>
                                {rep.score} · {rep.category}
                              </span>
                            ) : '—'}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                    {/* DNS sub-section (9.9) */}
                    {(networkQuery.data?.dns ?? []).length > 0 && (
                      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--ha-border-subtle)' }}>
                        <strong style={{ color: 'var(--ha-foreground-primary)', font: 'var(--ha-type-compact)', fontWeight: 640 }}>DNS Queries</strong>
                        <table className="evidence-table" style={{ marginTop: '4px' }}>
                          <thead><tr><th>Query</th><th>Type</th><th>Resolved IPs</th><th>Time</th></tr></thead>
                          <tbody>{(networkQuery.data?.dns ?? []).map((dns, i) => (
                            <tr key={`dns-${i}`}>
                              <td><code>{dns.queryName}</code></td>
                              <td>{dns.queryType}</td>
                              <td><code>{dns.responseIps.join(', ')}</code></td>
                              <td>{formatTime(dns.timestamp)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                    {/* TLS sub-section (9.10) */}
                    {(networkQuery.data?.tls ?? []).length > 0 && (
                      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--ha-border-subtle)' }}>
                        <strong style={{ color: 'var(--ha-foreground-primary)', font: 'var(--ha-type-compact)', fontWeight: 640 }}>TLS Sessions</strong>
                        <table className="evidence-table" style={{ marginTop: '4px' }}>
                          <thead><tr><th>Server Name</th><th>JA3</th><th>Version</th><th>Issuer</th><th>Subject</th><th>Expires</th></tr></thead>
                          <tbody>{(networkQuery.data?.tls ?? []).map((tls, i) => (
                            <tr key={`tls-${i}`}>
                              <td><code>{tls.serverName}</code></td>
                              <td><code>{tls.ja3Hash.slice(0, 12)}…</code></td>
                              <td>{tls.version}</td>
                              <td>{tls.issuer}</td>
                              <td>{tls.subject}</td>
                              <td>{formatDateTime(tls.notAfter)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (investigation.network.length > 0 ? (
                  <div className="evidence-table-wrap"><table className="evidence-table">
                    <thead><tr><th>Time</th><th>Process</th><th>Protocol</th><th>Destination</th><th>Port</th><th>Direction</th><th>Bytes</th><th>Reputation</th><th>State</th></tr></thead>
                    <tbody>{investigation.network.map((connection) => (
                      <tr key={connection.id} data-selected={connection.processId === selectedProcessId}>
                        <td>{formatTime(connection.timestamp)}</td><td>{connection.processName}</td><td>{connection.protocol}</td>
                        <td><code>{connection.destination}</code><CopyButton value={connection.destination} label="network destination" /></td>
                        <td>{connection.port}</td><td>{connection.direction}</td><td>{connection.bytes.toLocaleString()}</td>
                        <td><span className="table-verdict" data-verdict={connection.reputation}>{connection.reputation}</span></td><td>{connection.state}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : <DataUnavailable label="Network activity" contract="ALT-004" />)
              )}
              {evidenceTab === 'indicators' && (
                indicatorsQuery.isLoading ? <PanelSkeleton /> :
                indicatorsQuery.isError ? <DataUnavailable label="Indicators and provenance" contract="ALT-005" /> :
                (indicatorsQuery.data?.indicators ?? []).length > 0 ? (
                  <div className="evidence-table-wrap">
                    {/* Enrichment status badge (9.14) */}
                    <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--ha-border-subtle)' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px',
                        fontSize: '11px', fontWeight: 600,
                        background: indicatorsQuery.data?.enrichmentStatus === 'complete' ? 'var(--ha-fill-low-subtle)' : indicatorsQuery.data?.enrichmentStatus === 'partial' ? 'var(--ha-fill-medium-subtle)' : 'var(--ha-fill-info-subtle)',
                        color: indicatorsQuery.data?.enrichmentStatus === 'complete' ? 'var(--ha-severity-low)' : indicatorsQuery.data?.enrichmentStatus === 'partial' ? 'var(--ha-severity-medium)' : 'var(--ha-severity-info)',
                      }}>
                        Enrichment: {indicatorsQuery.data?.enrichmentStatus ?? 'unknown'}
                      </span>
                      <span style={{ color: 'var(--ha-foreground-tertiary)', fontSize: '11px' }}>{indicatorsQuery.data?.totalCount ?? 0} total indicators</span>
                    </div>
                    {/* IOC table (9.12) */}
                    <table className="evidence-table">
                      <thead><tr><th>Type</th><th>Value</th><th>Verdict</th><th>Confidence</th><th>Sources</th><th>TLP</th><th>Actions</th></tr></thead>
                      <tbody>{(indicatorsQuery.data?.indicators ?? []).map((ioc) => (
                        <tr key={ioc.id}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><IocTypeIcon type={ioc.type} /> {ioc.type}</td>
                          <td><code style={{ fontFamily: 'var(--ha-font-mono)', fontSize: '10px' }}>{ioc.value}</code></td>
                          <td><span style={{ color: verdictColor(ioc.verdict), fontWeight: 610, textTransform: 'capitalize', fontSize: '11px' }}>{ioc.verdict}</span></td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '40px', height: '5px', background: 'var(--ha-surface-elevated)', borderRadius: '3px', overflow: 'hidden', display: 'inline-block' }}>
                                <span style={{ display: 'block', height: '100%', width: `${ioc.confidence}%`, background: ioc.confidence >= 80 ? 'var(--ha-severity-critical)' : ioc.confidence >= 50 ? 'var(--ha-severity-high)' : 'var(--ha-severity-medium)', borderRadius: '3px' }} />
                              </span>
                              {ioc.confidence}%
                            </span>
                          </td>
                          <td>{ioc.sources.map((src) => (
                            <span key={src} style={{ display: 'inline-block', marginRight: '3px', padding: '1px 5px', background: 'var(--ha-surface-elevated)', borderRadius: '3px', fontSize: '10px', color: 'var(--ha-foreground-secondary)' }}>{src}</span>
                          ))}</td>
                          <td><span style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 600, color: ioc.tlp === 'red' ? 'var(--ha-severity-critical)' : ioc.tlp === 'amber' ? 'var(--ha-severity-high)' : ioc.tlp === 'green' ? 'var(--ha-severity-low)' : 'var(--ha-foreground-tertiary)' }}>{ioc.tlp}</span></td>
                          <td>
                            {/* Copy IOC button (9.13) */}
                            <button
                              type="button"
                              className="alert-copy-button"
                              onClick={() => { void navigator.clipboard.writeText(ioc.value); }}
                              aria-label={`Copy IOC ${ioc.value}`}
                              title="Copy IOC"
                            >
                              <Clipboard size={13} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : (investigation.indicators.length > 0 ? (
                  <div className="indicator-grid">{investigation.indicators.map((indicator) => (
                    <article key={indicator.id} data-verdict={indicator.verdict}>
                      <span>{indicator.type}</span><code>{indicator.value}</code><CopyButton value={indicator.value} label={`${indicator.type} indicator`} />
                      <strong>{indicator.verdict} · {indicator.confidence ?? '—'}%</strong><small>{indicator.source}</small>
                    </article>
                  ))}</div>
                ) : <DataUnavailable label="Indicators and provenance" contract="ALT-005" />)
              )}
              {evidenceTab === 'related' && (
                relatedQuery.isLoading ? <PanelSkeleton /> :
                relatedQuery.isError ? <DataUnavailable label="Related-alert correlations" contract="ALT-007" /> :
                (relatedQuery.data?.relatedAlerts ?? []).length > 0 ? (
                  <div className="related-alert-list">{(relatedQuery.data?.relatedAlerts ?? []).map((alert) => (
                    <button key={alert.id} type="button" onClick={() => navigate(`/alerts/${alert.id}`)}>
                      <span className="severity-dot" data-severity={alert.severity} />
                      <span>
                        <strong>{alert.title}</strong>
                        <small style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '3px' }}>
                          <span>{alert.id} · {alert.ruleName} · {alert.primaryEntity}</span>
                          {alert.correlationReasons.map((reason, i) => (
                            <span
                              key={`${alert.id}-reason-${i}`}
                              style={{
                                display: 'inline-block',
                                padding: '1px 6px',
                                borderRadius: '3px',
                                fontSize: '10px',
                                fontWeight: 600,
                                background: `color-mix(in srgb, ${correlationStrengthColor(reason.strength)} 14%, transparent)`,
                                color: correlationStrengthColor(reason.strength),
                              }}
                            >
                              {reason.type.replace(/_/g, ' ')} ({reason.strength})
                            </span>
                          ))}
                        </small>
                      </span>
                      <time>{formatDateTime(alert.timestamp)}</time>
                      <ExternalLink size={13} aria-hidden="true" />
                    </button>
                  ))}</div>
                ) : (investigation.relatedAlerts.length > 0 ? (
                  <div className="related-alert-list">{investigation.relatedAlerts.map((alert) => (
                    <button key={alert.id} type="button" onClick={() => navigate(`/alerts/${alert.id}`)}>
                      <span className="severity-dot" data-severity={alert.severity} /><span><strong>{alert.title}</strong><small>{alert.id} · {alert.relation} · {alert.sharedEntities.join(', ')}</small></span>
                      <time>{formatDateTime(alert.timestamp)}</time><ExternalLink size={13} aria-hidden="true" />
                    </button>
                  ))}</div>
                ) : <DataUnavailable label="Related-alert correlations" contract="ALT-007" />)
              )}
              {evidenceTab === 'fields' && (
                <div className="highlighted-fields">
                  <label><Search size={14} aria-hidden="true" /><input value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} placeholder="Filter fields or values" aria-label="Filter highlighted fields" /></label>
                  <dl>{filteredFields.map(([field, value]) => <div key={field}><dt>{field}</dt><dd><code>{value}</code><CopyButton value={value} label={field} /></dd></div>)}</dl>
                </div>
              )}
              {evidenceTab === 'raw' && <SyntaxHighlightedJson data={investigation.rawEvent} />}
            </div>
          </section>
        </main>
      )}

      {workspaceTab === 'event' && (
        <main id="alert-workspace-panel-event" role="tabpanel" aria-labelledby="alert-workspace-tab-event" className="alert-investigation-detail-view">
          <section className="alert-investigation-panel alert-investigation-panel--wide">
            <PanelHeading icon={FileSearch} title="Detection narrative" />
            <div className="alert-investigation-panel__body event-narrative">
              <h2>{investigation.rule.name ?? investigation.title}</h2><p>{guideQuery.data?.alertReason ?? investigation.rule.reason}</p>
              <div><Metric label="Rule ID" value={investigation.rule.id ?? 'Not provided'} /><Metric label="Detector" value={investigation.detector} /><Metric label="Data source" value={investigation.dataSource} /></div>
            </div>
          </section>
          <section className="alert-investigation-panel">
            <PanelHeading icon={ListTree} title="Highlighted fields" meta={selectedEventId ? undefined : `${Object.keys(investigation?.highlightedFields ?? {}).length}`} />
            <div className="alert-investigation-panel__body highlighted-fields">
              {eventHighlightedQuery.isLoading && selectedEventId ? (
                <div className="alert-investigation-skeleton" style={{ height: '6rem' }} aria-busy="true" aria-label="Loading highlighted fields" />
              ) : eventHighlightedQuery.isError && selectedEventId ? (
                <DataUnavailable label="Event highlighted fields" contract="ALT-011" />
              ) : (eventHighlightedQuery.data as AlertEventHighlightedResponse | undefined)?.fields ? (
                <dl>{(eventHighlightedQuery.data as AlertEventHighlightedResponse).fields
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((field) => <div key={field.key} data-emphasis={field.emphasis}><dt>{field.key}</dt><dd><code>{field.value}</code><CopyButton value={field.value} label={field.key} /></dd></div>)}</dl>
              ) : (
                <>
                  <label><Search size={14} aria-hidden="true" /><input value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} placeholder="Filter fields or values" aria-label="Filter highlighted fields" /></label>
                  <dl>{filteredFields.map(([field, value]) => <div key={field}><dt>{field}</dt><dd><code>{value}</code><CopyButton value={value} label={field} /></dd></div>)}</dl>
                </>
              )}
            </div>
          </section>
          <section className="alert-investigation-panel">
            <PanelHeading icon={Binary} title="Raw source event" />
            <div className="alert-investigation-panel__body alert-investigation-panel__body--flush">
              {eventRawQuery.isLoading && selectedEventId && evidenceTab === 'raw' ? (
                <div className="alert-investigation-skeleton" style={{ height: '6rem' }} aria-busy="true" aria-label="Loading raw event" />
              ) : (eventRawQuery.data as AlertEventRawResponse | undefined)?.raw ? (
                <SyntaxHighlightedJson data={(eventRawQuery.data as AlertEventRawResponse).raw} />
              ) : (
                <SyntaxHighlightedJson data={investigation.rawEvent} />
              )}
            </div>
          </section>
        </main>
      )}

      {workspaceTab === 'history' && (
        <main id="alert-workspace-panel-history" role="tabpanel" aria-labelledby="alert-workspace-tab-history" className="alert-investigation-history-view">
          <section className="alert-investigation-panel">
            <PanelHeading icon={History} title="Alert history" meta={activityQuery.data ? `${activityQuery.data.items.length} events` : `${investigation.history.length} events`} />
            <div className="alert-investigation-panel__body history-list">
              {activityQuery.isLoading ? (
                <div className="alert-investigation-skeleton" style={{ height: '6rem' }} aria-busy="true" aria-label="Loading activity history" />
              ) : activityQuery.isError ? (
                (investigation.history.length > 0 ? <ol>{investigation.history.map((item) => (
                  <li key={item.id}><span><Clock3 size={13} aria-hidden="true" /></span><div><strong>{item.action}</strong><p>{item.detail}</p><small>{item.actor} · {formatDateTime(item.timestamp)}</small></div></li>
                ))}</ol> : <DataUnavailable label="Alert activity history" contract="ALT-008" />)
              ) : (activityQuery.data?.items ?? []).length > 0 ? (
                <>
                  <ol>{(activityQuery.data?.items ?? []).map((item) => (
                    <li key={item.id}><span><Clock3 size={13} aria-hidden="true" /></span><div><strong>{item.action}</strong><p>{item.detail}</p><small>{item.actor} · {formatDateTime(item.timestamp)}</small></div></li>
                  ))}</ol>
                  {activityQuery.data?.hasMore && (
                    <button className="alert-text-button" type="button" onClick={() => setActivityCursor(activityQuery.data?.nextCursor ?? undefined)}>
                      Load more
                    </button>
                  )}
                </>
              ) : <DataUnavailable label="Alert activity history" contract="ALT-008" />}
            </div>
          </section>
          <section className="alert-investigation-panel">
            <PanelHeading icon={ShieldCheck} title="Response actions" />
            <div className="alert-investigation-panel__body">
              {fixtureMode ? (
                <div className="response-action-list">
                  {investigation.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      data-tone={action.tone}
                      disabled={!action.available}
                      onClick={() => setPendingAction(action)}
                    >
                      <span><ShieldCheck size={15} aria-hidden="true" /></span>
                      <span><strong>{action.label}</strong><small>{action.target}</small></span>
                      <Play size={12} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <ResponseActionsPanel
                  targetId={investigation.entities[0]?.id ?? id}
                  alertId={id}
                />
              )}
            </div>
          </section>
        </main>
      )}

      {pendingAction && (
        <HaConfirmationModal
          isOpen
          title={`Confirm ${pendingAction.label}`}
          message={`${pendingAction.description} Target: ${pendingAction.target}. ${pendingAction.requiresApproval ? 'This action requires an approval record.' : ''}`}
          confirmLabel={fixtureMode ? 'Simulate action' : 'Run action'}
          cancelLabel="Cancel"
          variant={pendingAction.tone === 'danger' ? 'danger' : 'primary'}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            setFixtureActionResult(fixtureMode
              ? `${pendingAction.label} simulated; no endpoint or asset was changed.`
              : 'Open History & response to run governed response actions.');
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}

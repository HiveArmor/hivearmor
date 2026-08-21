export interface AgentPackage {
  id: string;
  platform: string;
  arch: string;
  filename: string;
  href: string;
}

export const AGENT_PACKAGES: AgentPackage[] = [
  {
    id: 'linux-amd64',
    platform: 'Linux',
    arch: 'x86_64',
    filename: 'hivearmor_agent_service_linux_amd64',
    href: '/agent-packages/hivearmor_agent_service_linux_amd64',
  },
  {
    id: 'linux-arm64',
    platform: 'Linux',
    arch: 'arm64',
    filename: 'hivearmor_agent_service_linux_arm64',
    href: '/agent-packages/hivearmor_agent_service_linux_arm64',
  },
  {
    id: 'darwin-amd64',
    platform: 'macOS',
    arch: 'x86_64',
    filename: 'hivearmor_agent_service_darwin_amd64',
    href: '/agent-packages/hivearmor_agent_service_darwin_amd64',
  },
  {
    id: 'darwin-arm64',
    platform: 'macOS',
    arch: 'arm64',
    filename: 'hivearmor_agent_service_darwin_arm64',
    href: '/agent-packages/hivearmor_agent_service_darwin_arm64',
  },
  {
    id: 'windows-amd64',
    platform: 'Windows',
    arch: 'x86_64',
    filename: 'hivearmor_agent_service_windows_amd64.exe',
    href: '/agent-packages/hivearmor_agent_service_windows_amd64.exe',
  },
  {
    id: 'windows-arm64',
    platform: 'Windows',
    arch: 'arm64',
    filename: 'hivearmor_agent_service_windows_arm64.exe',
    href: '/agent-packages/hivearmor_agent_service_windows_arm64.exe',
  },
];

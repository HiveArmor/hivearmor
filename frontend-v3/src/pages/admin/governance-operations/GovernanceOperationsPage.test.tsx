import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { governanceOperationsFixture } from './governanceOperations.fixtures';
import { GovernanceOperationsPage } from './GovernanceOperationsPage';

import { useAuthStore } from '@/store/auth.store';

const listMock=vi.hoisted(()=>vi.fn());
vi.mock('./governanceOperations.service',()=>({governanceOperationsService:{fixtureMode:true,list:listMock}}));
vi.mock('@/hooks/useEpsStream',()=>({useEpsStream:()=>({connected:true,eps:12840})}));
vi.mock('@/services/auditLog.service',()=>({downloadAuditLogExport:vi.fn()}));

function renderPage(initialView:'audit'|'retention'|'configuration'='audit'):void{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<MemoryRouter><QueryClientProvider client={client}><GovernanceOperationsPage initialView={initialView}/></QueryClientProvider></MemoryRouter>);
}

describe('GovernanceOperationsPage',()=>{
  beforeEach(()=>{
    listMock.mockReset();listMock.mockResolvedValue(structuredClone(governanceOperationsFixture));
    useAuthStore.setState({user:{id:1,login:'admin',firstName:'Platform',lastName:'Admin',email:'admin@example.test',roles:['ROLE_ADMIN'],langKey:'en'},token:'test-token',isAuthenticated:true,isLoading:false,selectedTenantId:1});
  });

  it('renders a read-only audit ledger and opens evidence context',async()=>{
    renderPage();
    const event=await screen.findByText('Settings Change Requested');
    fireEvent.click(event);
    expect(screen.getByRole('complementary',{name:/Settings Change Requested context/i})).toBeVisible();
    expect(screen.getByText('Integrity proof')).toBeVisible();
  });

  it('keeps retention separate and exposes lifecycle consequences',async()=>{
    renderPage('retention');
    expect(await screen.findByText('Security audit evidence')).toBeVisible();
    expect(screen.getByText('Hold evaluation')).toBeVisible();
    expect(screen.getByText('Irreversible, policy-authorized action')).toBeVisible();
  });

  it('uses the secret-safe settings projection and a governed proposal workflow',async()=>{
    renderPage('configuration');
    expect(await screen.findByText('Effective configuration, not an edit form')).toBeVisible();
    expect(screen.getAllByText('Masked · write only')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button',{name:'Propose change'})[0]);
    const dialog=screen.getByRole('dialog',{name:'Propose a configuration change'});
    expect(dialog).toBeVisible();
    expect(screen.getByRole('button',{name:'Close workflow'})).toHaveFocus();
    expect(screen.getByRole('button',{name:/Continue to diff/i})).toBeDisabled();
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps fixture-mode audit export disabled with honest copy',async()=>{
    renderPage();
    fireEvent.click(await screen.findByRole('button',{name:'Export evidence'}));
    const dialog=screen.getByRole('dialog',{name:'Export audit evidence'});
    expect(dialog).toBeVisible();
    expect(screen.getByText(/Visual fixture only/)).toBeVisible();
    expect(screen.getByText(/GET \/api\/ha-audit-log\/export/)).toBeVisible();
    expect(screen.getByRole('button',{name:/Download NDJSON/i})).toBeDisabled();
  });

  it('fails closed for non-administrators before loading data',()=>{
    useAuthStore.setState({user:{id:2,login:'analyst',firstName:'SOC',lastName:'Analyst',email:'analyst@example.test',roles:['ROLE_ANALYST'],langKey:'en'},token:'test-token',isAuthenticated:true,isLoading:false,selectedTenantId:1});
    renderPage();
    expect(screen.getByText('Governance access restricted')).toBeVisible();
    expect(screen.getByText(/Required permission: Platform Administrator/)).toBeVisible();
    expect(listMock).not.toHaveBeenCalled();
  });
});

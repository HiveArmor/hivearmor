import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAdministrationInventory, IdentityAdministrationView } from './identityAdministration.types';
import { IdentityAdministrationPage } from './IdentityAdministrationPage';

const inventory:IdentityAdministrationInventory={
  users:[{id:'u1',login:'maya.chen',displayName:'Maya Chen',email:'maya@example.test',state:'active',source:'oidc',roles:['ROLE_ADMIN'],tenantCount:2,mfaState:'enforced',lastSignInAt:'2026-08-22T12:00:00Z',createdAt:null,modifiedAt:null,reviewState:'due'}],
  tenants:[{id:'t1',name:'Northwind Financial',prefix:'northwind',domain:'northwind.example.test',state:'active',administration:'tenant_local',members:12,privilegedMembers:2,identityProviders:1,lastActivityAt:'2026-08-22T12:00:00Z',licenceExpiresAt:null}],
  federation:[{id:'f1',name:'Northwind Entra ID',protocol:'OIDC',state:'enabled',scope:'Northwind',endpointLabel:'login.example.test',lastActivityAt:null,owner:'Identity',secretState:'protected'}],
  reviews:[{id:'r1',name:'Platform administrators quarterly review',scope:'ROLE_ADMIN',reviewer:'Governance',cadence:'Quarterly',dueAt:'2026-08-25T12:00:00Z',decisionsComplete:2,decisionsTotal:3,state:'due',highPrivilege:true}],
  activity:[{id:'a1',occurredAt:'2026-08-22T12:00:00Z',actor:'maya.chen',action:'Role assignment changed',target:'omar.haddad',scope:'Platform',result:'success',reason:'Approved change',correlationId:'iam-1'}],
  totalUsers:1,totalTenants:1,privilegedUsers:1,inactiveUsers:0,reviewsDue:1,snapshotAt:'2026-08-22T12:00:00Z',bounded:true,platformScoped:true,partial:false,warnings:[],
};

vi.mock('./identityAdministration.service',()=>({identityAdministrationService:{fixtureMode:true,list:vi.fn(async()=>inventory)}}));
vi.mock('@/store/auth.store',()=>({useAuthStore:()=>({hasRole:(role:string)=>role==='ROLE_ADMIN'})}));
vi.mock('@/hooks/useEpsStream',()=>({useEpsStream:()=>({connected:true,eps:12840})}));
vi.mock('@/components/status-dock',()=>({StatusDock:()=> <div data-testid="status-dock">Connected · Live</div>}));

function renderPage(initialView:IdentityAdministrationView='directory',route='/admin/users'){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><IdentityAdministrationPage initialView={initialView}/></MemoryRouter></QueryClientProvider>);
}

beforeEach(()=>vi.clearAllMocks());

describe('IdentityAdministrationPage',()=>{
  it('renders an evidence-honest identity control plane with shared status',async()=>{
    renderPage();
    expect(await screen.findByText('Identity & Tenancy')).toBeVisible();
    expect(screen.getByText('Maya Chen')).toBeVisible();
    expect(screen.getByText('Global, delegated and tenant-local authority remain separate')).toBeVisible();
    expect(screen.getByTestId('status-dock')).toBeInTheDocument();
  });

  it('opens full-height principal context from the directory',async()=>{
    renderPage();
    fireEvent.click(await screen.findByText('Maya Chen'));
    expect(screen.getByLabelText('Maya Chen context')).toBeVisible();
    expect(screen.getByText('Authority boundary')).toBeVisible();
  });

  it('supports tenant route entry and tenant context',async()=>{
    renderPage('tenants','/admin/tenants');
    expect(await screen.findByText('Northwind Financial')).toBeVisible();
    fireEvent.click(screen.getByText('Northwind Financial'));
    expect(screen.getByLabelText('Northwind Financial context')).toBeVisible();
  });

  it('exposes access review and federation workflows without performing mutations',async()=>{
    renderPage('access','/admin/users?view=access');
    expect(await screen.findByText('Platform administrators quarterly review')).toBeVisible();
    fireEvent.click(screen.getByRole('tab',{name:/Federation/i}));
    expect(await screen.findByText('Northwind Entra ID')).toBeVisible();
    expect(screen.getByText('Secrets are write-only; tenant mappings and claim policy require server authority')).toBeVisible();
  });
});

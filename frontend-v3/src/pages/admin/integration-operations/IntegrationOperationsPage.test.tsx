import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { integrationOperationsFixture } from './integrationOperations.fixtures';
import type { IntegrationView } from './integrationOperations.types';
import { IntegrationOperationsPage } from './IntegrationOperationsPage';

import { useAuthStore } from '@/store/auth.store';
import type { HaUser } from '@/store/auth.store';

const listInventory=vi.hoisted(()=>vi.fn());
vi.mock('./integrationOperations.service',()=>({integrationOperationsService:{fixtureMode:true,list:listInventory}}));
vi.mock('@/hooks/useEpsStream',()=>({useEpsStream:()=>({connected:true,eps:12840})}));
vi.mock('@/components/status-dock',()=>({StatusDock:()=> <div data-testid="status-dock">Connected · Live</div>}));
vi.mock('@/components/ha-api-key-create-modal/HaApiKeyCreateModal',()=>({HaApiKeyCreateModal:()=>null}));
vi.mock('@/components/ha-api-key-token-dialog/HaApiKeyTokenDialog',()=>({HaApiKeyTokenDialog:()=>null}));

function user(roles:string[]):HaUser{return{id:1,login:'admin',firstName:'Integration',lastName:'Admin',email:'admin@example.test',roles,langKey:'en'};}
function renderPage(initialView:IntegrationView='overview'):void{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<MemoryRouter><QueryClientProvider client={client}><IntegrationOperationsPage initialView={initialView}/></QueryClientProvider></MemoryRouter>);}

describe('IntegrationOperationsPage',()=>{
  beforeEach(()=>{listInventory.mockReset();listInventory.mockResolvedValue(structuredClone(integrationOperationsFixture));useAuthStore.setState({user:user(['ROLE_ADMIN']),token:'test-token',isAuthenticated:true,isLoading:false,selectedTenantId:1});});

  it('renders the connection-to-operation trust chain and operational summary',async()=>{renderPage();expect(await screen.findByText('Integrations & Delivery')).toBeVisible();expect(screen.getByText('Operational trust chain')).toBeVisible();expect(screen.getByText('Authorize')).toBeVisible();expect(screen.getByText('Delivery reliability')).toBeVisible();expect(screen.getByTestId('status-dock')).toBeInTheDocument();});

  it('opens a full-height connector context after explicit selection',async()=>{renderPage('connectors');fireEvent.click(await screen.findByText('CrowdStrike Falcon'));expect(screen.getByText('Connection identity')).toBeVisible();expect(screen.getByText('Runtime observation')).toBeVisible();expect(screen.getByText('Capabilities')).toBeVisible();});

  it('distinguishes delivery destinations from routing policy',async()=>{renderPage('delivery');expect(await screen.findByText('Destinations')).toBeVisible();expect(screen.getByText('Routing policy')).toBeVisible();fireEvent.click(screen.getAllByText('SOC priority email')[0]);expect(screen.getByText('Delivery evidence')).toBeVisible();expect(screen.getByText(/authoritative provider receipt/i)).toBeVisible();});

  it('never renders plaintext service-key material in inventory',async()=>{renderPage('access');expect(await screen.findByText('Collector production')).toBeVisible();expect(screen.getByText('ha_k7n4Q••••')).toBeVisible();expect(screen.queryByText(/^ha_[A-Za-z0-9_-]{20,}$/)).not.toBeInTheDocument();});

  it('does not query the inventory for a non-admin role',async()=>{useAuthStore.setState({user:user(['ROLE_ANALYST']),token:'test-token',isAuthenticated:true,isLoading:false,selectedTenantId:1});renderPage();expect(await screen.findByText('Integration operations access restricted')).toBeVisible();expect(listInventory).not.toHaveBeenCalled();});
});

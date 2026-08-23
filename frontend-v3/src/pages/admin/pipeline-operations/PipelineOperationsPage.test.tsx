import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pipelineOperationsFixture } from './pipelineOperations.fixtures';
import type { PipelineView } from './pipelineOperations.types';
import { PipelineOperationsPage } from './PipelineOperationsPage';

import { useAuthStore } from '@/store/auth.store';
import type { HaUser } from '@/store/auth.store';

const listInventory=vi.hoisted(()=>vi.fn());
vi.mock('./pipelineOperations.service',()=>({pipelineOperationsService:{fixtureMode:true,list:listInventory}}));
vi.mock('@/hooks/useEpsStream',()=>({useEpsStream:()=>({connected:true,eps:12840})}));
vi.mock('@/components/status-dock',()=>({StatusDock:()=> <div data-testid="status-dock">Connected · Live</div>}));

function userWithRoles(roles:string[]):HaUser{return{id:1,login:'operator',firstName:'Pipeline',lastName:'Operator',email:'operator@example.test',roles,langKey:'en'};}
function renderPage(initialView:PipelineView='overview'):void{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<MemoryRouter><QueryClientProvider client={client}><PipelineOperationsPage initialView={initialView}/></QueryClientProvider></MemoryRouter>);}

describe('PipelineOperationsPage',()=>{
  beforeEach(()=>{listInventory.mockReset();listInventory.mockResolvedValue(structuredClone(pipelineOperationsFixture));useAuthStore.setState({user:userWithRoles(['ROLE_ADMIN']),token:'test-token',isAuthenticated:true,isLoading:false,selectedTenantId:1});});

  it('renders the measured source-to-index flow without inventing SLO thresholds',async()=>{renderPage();expect(await screen.findByText('Pipeline & Ingestion')).toBeVisible();expect(screen.getByText('Source-to-index flow')).toBeVisible();expect(screen.getByText('No inferred SLO thresholds')).toBeVisible();expect(screen.getByText('Normalize')).toBeVisible();expect(screen.getByTestId('status-dock')).toBeInTheDocument();});

  it('opens progressive source context after explicit selection',async()=>{renderPage('sources');const row=await screen.findByText('AWS organization trail');fireEvent.click(row);expect(screen.getByText('Collection and trust')).toBeVisible();expect(screen.getByText('Checkpointed object')).toBeVisible();expect(screen.getByText('Data quality')).toBeVisible();});

  it('keeps replay bounded to a disabled governed preview',async()=>{renderPage('failures');const row=await screen.findByText('SCHEMA_FIELD_TYPE');fireEvent.click(row);fireEvent.click(screen.getByRole('button',{name:'Preview replay'}));expect(screen.getByRole('dialog',{name:/Review SCHEMA_FIELD_TYPE/i})).toBeVisible();expect(screen.getByText(/No raw payload is displayed/i)).toBeVisible();expect(screen.getByRole('button',{name:'Queue replay'})).toBeDisabled();});

  it('does not query operational data for an unauthorized role',async()=>{useAuthStore.setState({user:userWithRoles(['ROLE_USER']),token:'test-token',isAuthenticated:true,isLoading:false,selectedTenantId:1});renderPage();expect(await screen.findByText('Pipeline operations access restricted')).toBeVisible();expect(listInventory).not.toHaveBeenCalled();});
});

/**
 * AppLayout — Main layout shell for authenticated routes.
 * Renders HaMasthead, HaNavigation, and page content.
 * On mount, fetches /api/ha-admin/system-info and populates the systemInfoStore.
 * Renders AirGapBanner between the masthead and the page outlet.
 */

import { Suspense, useEffect } from 'react';

import { Outlet } from 'react-router-dom';

import { AirGapBanner } from '@/components/AirGapBanner';
import { AppSuspenseFallback } from '@/components/app-suspense-fallback/AppSuspenseFallback';
import { HaMasthead } from '@/components/ha-masthead/HaMasthead';
import { HaNavigation } from '@/components/ha-navigation/HaNavigation';
import { ToastStack } from '@/components/toast-stack/ToastStack';
import { useSidebarStore } from '@/store/sidebar.store';
import { type SystemInfo, useSystemInfoStore } from '@/store/systemInfoStore';

import './AppLayout.css';

export function AppLayout(): JSX.Element {
  const { collapsed } = useSidebarStore();

  useEffect(() => {
    const token = localStorage.getItem('hivearmor_auth_token');
    if (!token) return;

    fetch('/api/ha-admin/system-info', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((r) => (r.ok ? (r.json() as Promise<SystemInfo>) : null))
      .then((data) => {
        if (data) {
          useSystemInfoStore.getState().setSystemInfo(data);
        }
      })
      .catch(() => {
        /* silent-fail — store stays at initial state, banner never renders */
      });
  }, []);

  return (
    <div className="ha-app-layout" data-sidebar-collapsed={collapsed}>
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      <HaMasthead />
      <AirGapBanner />
      <HaNavigation />
      <main
        id="main-content"
        className="ha-app-main"
      >
        <Suspense fallback={<AppSuspenseFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <ToastStack />
    </div>
  );
}

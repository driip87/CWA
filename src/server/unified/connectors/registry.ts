import type { ConnectorAdapter, ConnectorCatalogEntry } from './types';
import { routewareFirestoreConnector } from './routewareFirestoreConnector';

const availableAdapters = new Map<string, ConnectorAdapter>([[routewareFirestoreConnector.vendor, routewareFirestoreConnector]]);

const plannedCatalog: ConnectorCatalogEntry[] = [
  {
    vendor: 'routesmart',
    name: 'RouteSmart Optimization',
    status: 'planned',
    capabilities: [
      { domain: 'routes', read: true, write: false },
      { domain: 'route_runs', read: true, write: false },
      { domain: 'stops', read: true, write: false },
    ],
    adapterMode: 'planned',
  },
  {
    vendor: 'fleetmind',
    name: 'FleetMind / Safe Fleet Telemetry',
    status: 'planned',
    capabilities: [
      { domain: 'vehicles', read: true, write: false },
      { domain: 'service_events', read: true, write: false },
      { domain: 'proofs', read: true, write: false },
    ],
    adapterMode: 'planned',
  },
  {
    vendor: 'wm',
    name: 'WM Service Accounts',
    status: 'planned',
    capabilities: [
      { domain: 'customers', read: true, write: false },
      { domain: 'billing_statuses', read: true, write: false },
    ],
    adapterMode: 'planned',
  },
];

export function getConnectorAdapter(vendor: string) {
  return availableAdapters.get(vendor) || null;
}

export function listConnectorCatalog(): ConnectorCatalogEntry[] {
  return [...availableAdapters.values(), ...plannedCatalog].map((entry) => ({
    vendor: entry.vendor,
    name: entry.name,
    status: entry.status,
    adapterMode: entry.adapterMode,
    capabilities: entry.capabilities,
  }));
}

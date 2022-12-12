import { checkExists, exists } from 'js/common/asserts';
import { HistoryService } from 'js/corgi/history/history_service';
import { Service, ServiceResponse } from 'js/corgi/service';

import { currentUrl } from '../common/ssr_aware';

interface SearchResults {
  kind: 'search_results';
}

interface SearchTrail {
  kind: 'search_trail';
  trail: string;
}

interface TrailDetailByNumeric {
  kind: 'trail_detail_by_numeric';
  trail: string;
}

interface TrailDetailByReadable {
  kind: 'trail_detail_by_readable';
  trail: string;
}

export type Route = SearchResults|SearchTrail|TrailDetailByNumeric|TrailDetailByReadable;

const routes: {[k in Route['kind']]: RegExp} = {
  'search_results': /^\/(search)?$/,
  'search_trail': /^\/search\/trail\/(?<trail>\d+)$/,
  'trail_detail_by_numeric': /^\/trail\/id\/(?<trail>\d+)$/,
  'trail_detail_by_readable': /^\/trail\/(?<trail>.+)$/,
};

interface Listener {
  routeChanged(active: Route): void;
}

type Deps = typeof ViewsService.deps;

export class ViewsService extends Service<Deps> {

  static getActiveRoute(): Route {
    const url = currentUrl();
    return checkExists(matchPath(url.pathname));
  }

  static deps() {
    return {
      services: {
        history: HistoryService,
      },
    };
  }

  private readonly history: HistoryService;
  private readonly listeners: Set<Listener>;

  constructor(response: ServiceResponse<Deps>) {
    super(response);
    this.history = response.deps.services.history;
    this.listeners = new Set();

    this.history.addListener(this);
  }

  urlChanged(url: URL): void {
    const active = checkExists(matchPath(url.pathname));
    if (active) {
      for (const listener of this.listeners) {
        listener.routeChanged(active);
      }
    } else {
      console.error(`Unable to find a route for ${url}`);
    }
  }

  addListener(listener: Listener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: Listener): void {
    this.listeners.delete(listener);
  }

  showOverview(camera?: {lat: number, lng: number, zoom: number}): void {
    if (camera) {
      this.history.goTo(`/?lat=${camera.lat}&lng=${camera.lng}&zoom=${camera.zoom}`);
    } else {
      this.history.goTo('/');
    }
  }

  showSearchResults({boundary, camera, query}: {
    boundary?: bigint,
    camera?: {lat: number, lng: number, zoom: number},
    query?: string,
  }): void {
    const filters = [
      boundary ? `boundary=${boundary}` : undefined,
      camera ? `lat=${camera.lat}&lng=${camera.lng}&zoom=${camera.zoom}` : undefined,
      query ? `query=${encodeURIComponent(query)}` : undefined,
    ].filter(exists);
    this.history.goTo(`/search?${filters.join('&')}`);
  }

  showTrail(id: bigint): void {
    this.history.goTo(`/search/trail/${id}`);
  }
}

function matchPath(path: string): Route|undefined {
  for (const [kind, regex] of Object.entries(routes)) {
    const match = regex.exec(path);
    if (match) {
      const groups: {[key: string]: string} = {};
      for (const [key, value] of Object.entries(match.groups ?? {})) {
        groups[key] = decodeURIComponent(value);
      }
      return {
        kind,
        ...groups,
      } as Route;
    }
  }
  return undefined;
}


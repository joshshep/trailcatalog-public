import { checkExists } from 'js/common/asserts';
import { Debouncer } from 'js/common/debouncer';
import { Controller, Response } from 'js/corgi/controller';

import { latLngFromBase64E7 } from './common/data';
import { currentUrl } from './common/ssr_aware';
import { TrailSearchResult } from './models/types';
import { ViewsService } from './views/views_service';

import { DataResponses, fetchData } from './data';

type Deps = typeof SearchController.deps;

export interface State {
  boundaries: Array<{
    id: bigint;
    name: string;
    type: number;
  }>;
  query: string;
  trails: TrailSearchResult[],
}

export class SearchController extends Controller<{}, Deps, HTMLElement, State> {

  static deps() {
    return {
      services: {
        views: ViewsService,
      },
    };
  }

  private readonly debouncer: Debouncer;
  private readonly views: ViewsService;
  private lastQuery: string;

  constructor(response: Response<SearchController>) {
    super(response);
    this.lastQuery = '';
    this.views = response.deps.services.views;

    this.debouncer = new Debouncer(200 /* ms */, () => {
      this.actuallySearch(this.lastQuery);
    });
  }

  search(e: KeyboardEvent): void {
    const input = checkExists(e.srcElement) as HTMLInputElement;
    this.lastQuery = input.value;

    if (e.key === "Enter") {
      this.goToSearchPage();
    } else {
      this.debouncer.trigger();
    }
  }

  private async actuallySearch(query: string): Promise<void> {
    const bp = fetchData('search_boundaries', {query});
    const tp = fetchData('search_trails', {query, limit: 5});

    this.updateState({
      boundaries: (await bp).results.map(({id, name, type}) => ({
        id: BigInt(id),
        name,
        type,
      })),
      query,
      trails: searchTrailsFromRaw(await tp),
    });
  }

  private clearSearch(): void {
    const url = currentUrl();
    let camera;
    if (url.searchParams.has('lat')
        || url.searchParams.has('lng')
        || url.searchParams.has('zoom')) {
      camera = {
        lat: Number(url.searchParams.get('lat')),
        lng: Number(url.searchParams.get('lng')),
        zoom: Number(url.searchParams.get('zoom')),
      };
    }
    this.views.showOverview(camera);
  }

  private goToSearchPage(): void {
    this.views.showSearchResults({
      query: this.lastQuery,
    });
  }
}

export function searchTrailsFromRaw(raw: DataResponses['search_trails']): TrailSearchResult[] {
  return raw.results.map(
      t =>
          new TrailSearchResult(
              BigInt(t.id),
              t.name,
              latLngFromBase64E7(t.marker),
              t.length_meters,
              t.boundaries.map(id => ({id, ...raw.boundaries[id]})),
          ));
}


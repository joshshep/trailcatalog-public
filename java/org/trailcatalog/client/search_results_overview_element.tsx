import * as corgi from 'js/corgi';
import { FlatButton, OutlinedButton } from 'js/dino/button';
import { Checkbox } from 'js/dino/checkbox';
import { ACTION } from 'js/dino/events';
import { FabricIcon } from 'js/dino/fabric';

import { currentUrl } from './common/ssr_aware';
import { emptyLatLngRect } from './common/types';
import { DATA_CHANGED, HOVER_CHANGED, MAP_MOVED, SELECTION_CHANGED } from './map/events';
import { MapElement } from './map/map_element';
import { Trail, TrailSearchResult } from './models/types';

import { BoundaryCrumbs } from './boundary_crumbs';
import { boundaryFromRaw, trailsInBoundaryFromRaw } from './boundary_detail_controller';
import { initialData } from './data';
import { Header } from './page';
import { searchTrailsFromRaw } from './search_controller';
import { LIMIT, LoadingController, SearchResultsOverviewController, State } from './search_results_overview_controller';
import { setTitle } from './title';
import { TrailSidebar } from './trail_list';
import { TrailPopup } from './trail_popup';

export function SearchResultsOverviewElement(
    {}: {}, state: State|undefined, updateState: (newState: State) => void) {
  const search = currentUrl().searchParams;
  const boundaryId = search.get('boundary') ?? undefined;
  const query = search.get('query') ?? undefined;

  setTitle(query);

  if (!state || boundaryId !== state.boundaryId || query !== state.searchQuery) {
    let boundary;
    let trailsInBoundary;
    let trailsInBoundaryIds;

    if (boundaryId) {
      const rawBoundary = initialData('boundary', {id: boundaryId});
      if (rawBoundary) {
        boundary = boundaryFromRaw(rawBoundary);
      }

      const rawTrailsInBoundary = initialData('trails_in_boundary', {boundary_id: boundaryId});
      if (rawTrailsInBoundary) {
        trailsInBoundary = trailsInBoundaryFromRaw(rawTrailsInBoundary);
        trailsInBoundaryIds = new Set(trailsInBoundary.map(t => t.id));
      }
    }

    let searchTrails;
    let searchTrailsIds;
    if (query) {
      const rawSearchTrails = initialData('search_trails', {query, limit: LIMIT});
      if (rawSearchTrails) {
        searchTrails = searchTrailsFromRaw(rawSearchTrails);
        searchTrailsIds = new Set(searchTrails.map(t => t.id));
      }
    }

    state = {
      boundary,
      boundaryId,
      filterInBoundary: !!boundary,
      mobileSidebarOpen: false,
      searchQuery: query,
      searchTrails,
      searchTrailsIds,
      trailsFilter: () => true,
      trailsInBoundary,
      trailsInBoundaryFilter: () => true,
      trailsInBoundaryIds,
      hovering: undefined,
      nearbyTrails: [],
      selectedCardPosition: [-1, -1],
      selectedTrails: [],
    };
  }

  return <>
      {((!boundaryId || state.boundary) && (!query || state.searchTrails))
          ? <Content boundaryId={boundaryId} query={query} state={state} updateState={updateState} />
          : <Loading boundaryId={boundaryId} query={query} state={state} updateState={updateState} />
      }
  </>;
}

function Loading({boundaryId, query, state, updateState}: {
  boundaryId?: string,
  query?: string,
  state: State,
  updateState: (newState: State) => void,
}) {
  return <>
    <div
        js={corgi.bind({
          controller: LoadingController,
          args: {boundaryId, query},
          events: {
            render: 'wakeup',
          },
          state: [state, updateState],
        })}
    >
      Loading...
    </div>
  </>;
}

function Content({boundaryId, query, state, updateState}: {
  boundaryId?: string,
  query?: string,
  state: State,
  updateState: (newState: State) => void,
}) {
  const filter = state.filterInBoundary ? state.trailsInBoundaryFilter : state.trailsFilter;

  let filteredTrails: Array<Trail|TrailSearchResult> = [];
  let bound;
  if (query) {
    if (state.searchTrails) {
      filteredTrails = state.searchTrails.filter(t => filter(t.id));

      bound = emptyLatLngRect();
      for (const trail of filteredTrails) {
        if (trail.bound.low[0] < bound.low[0]) {
          bound.low[0] = trail.bound.low[0];
        }
        if (trail.bound.high[0] > bound.high[0]) {
          bound.high[0] = trail.bound.high[0];
        }
        if (trail.bound.low[1] < bound.low[1]) {
          bound.low[1] = trail.bound.low[1];
        }
        if (trail.bound.high[1] > bound.high[1]) {
          bound.high[1] = trail.bound.high[1];
        }
      }
    }
  } else if (boundaryId) {
    if (state.boundary && state.trailsInBoundary) {
      bound = state.boundary.bound;
      if (state.filterInBoundary) {
        filteredTrails = state.trailsInBoundary;
      } else {
        filteredTrails = state.nearbyTrails;
      }
    }
  } else {
    filteredTrails = state.nearbyTrails;
  }

  const url = currentUrl();
  let llz;
  if (
      !bound
          || url.searchParams.has('lat')
          || url.searchParams.has('lng')
          || url.searchParams.has('zoom')) {
    llz = {
      lat: floatCoalesce(url.searchParams.get('lat'), 46.859369),
      lng: floatCoalesce(url.searchParams.get('lng'), -121.747888),
      zoom: floatCoalesce(url.searchParams.get('zoom'), 12),
    };
  }

  let trailDetails;
  if (state.selectedTrails.length > 0) {
    trailDetails =
        <TrailPopup
            position={state.selectedCardPosition}
            trails={state.selectedTrails}
        />;
  } else {
    trailDetails = <></>;
  }

  return <>
    <div
        js={corgi.bind({
          controller: SearchResultsOverviewController,
          args: {
            boundaryId,
            query,
          },
          events: {
            corgi: [
              [DATA_CHANGED, 'onDataChange'],
              [HOVER_CHANGED, 'onHoverChanged'],
              [MAP_MOVED, 'onMove'],
              [SELECTION_CHANGED, 'selectionChanged'],
            ],
            render: 'wakeup',
          },
          key: `${boundaryId}&${query}`,
          state: [state, updateState],
        })}
        className="flex flex-col h-full"
    >
      <Header
          query={query}
          extra={
            <span
                unboundEvents={{
                  corgi: [
                    [ACTION, 'locateMe'],
                  ]
                }}
            >
              <OutlinedButton
                  icon="Location"
                  label="Locate me"
              />
            </span>
          }
      />
      {state.boundary ? <SearchFilter state={state} /> : ''}
      <div className="flex grow h-full">
        <TrailSidebar
            hovering={state.hovering}
            mobileOpen={state.mobileSidebarOpen}
            nearby={filteredTrails}
        />
        <div className="grow h-full relative">
          <MapElement
              camera={llz ?? bound ?? {lat: 46.859369, lng: -121.747888, zoom: 12}}
              ref="map"
              filters={{
                trail: filter,
              }}
              overlays={{
                polygon: state.boundary?.polygon,
              }}
          />
          {trailDetails}
        </div>
      </div>
    </div>
  </>;
}

function SearchFilter({state}: {state: State}) {
  const divider = <div className="bg-black-opaque-20 w-px" />;
  return <>
    <aside className="bg-tc-gray-700 flex gap-3 items-center px-3 py-2 text-white">
      {
        state.boundary
            ? <>
              <div className="bg-tc-highlight-2 flex gap-2 px-2 rounded text-black">
                <a
                    className="flex gap-2 items-center"
                    href={`/boundary/${state.boundary.id}`}
                >
                  <img
                      aria-hidden="true"
                      className="h-[1em]"
                      src="/static/images/icons/boundary-filled.svg" />
                  {state.boundary.name}
                </a>

                {divider}

                <label
                    className="
                        cursor-pointer
                        flex
                        gap-2
                        items-center
                        hover:underline"
                      unboundEvents={{
                        corgi: [
                          [ACTION, 'toggleBoundaryFilter'],
                        ],
                      }}
                >
                  <Checkbox checked={state.filterInBoundary} />

                  Filter by boundary
                </label>

                {divider}

                <span
                    unboundEvents={{
                      corgi: [
                        [ACTION, 'clearBoundary'],
                      ],
                    }}
                >
                  <FlatButton icon="ChromeClose" />
                </span>
              </div>
            </>
            : ''
      }
    </aside>
  </>;
}

function floatCoalesce(...numbers: Array<string|number|null|undefined>): number {
  for (const x of numbers) {
    if (x === undefined || x === null) {
      continue;
    }
    const n = Number(x);
    if (!isNaN(n)) {
      return n;
    }
  }
  throw new Error('No valid floats');
}


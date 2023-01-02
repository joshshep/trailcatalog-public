import { S2Polygon } from 'java/org/trailcatalog/s2';
import * as corgi from 'js/corgi';
import { OutlinedButton } from 'js/dino/button';
import { ACTION } from 'js/dino/events';
import { FabricIcon } from 'js/dino/fabric';

import { currentUrl } from './common/ssr_aware';
import { LatLngRect, LatLngZoom } from './common/types';
import { MAP_MOVED } from './map/events';
import { Overlays } from './map/layers/overlay_data';
import { MapElement } from './map/map_element';
import { Trail } from './models/types';

import { Header } from './page';
import { SidebarController, State } from './sidebar_controller';

export function ViewportLayoutElement({
  active,
  bannerContent,
  camera,
  filters,
  overlays,
  query,
  ref,
  sidebarContent,
}: {
  active?: {
    trails?: Trail[];
  };
  bannerContent?: string;
  camera?: LatLngRect|LatLngZoom;
  filters?: {
    trail?: (id: bigint) => boolean;
  };
  overlays?: Overlays & {
    content?: string;
  };
  query?: string;
  ref?: string;
  sidebarContent: string;
}, state: State|undefined, updateState: (newState: State) => void) {
  if (!state) {
    const url = currentUrl();
    if (
        !camera
            || url.searchParams.has('lat')
            || url.searchParams.has('lng')
            || url.searchParams.has('zoom')) {
      camera = {
        lat: floatCoalesce(url.searchParams.get('lat'), 46.859369),
        lng: floatCoalesce(url.searchParams.get('lng'), -121.747888),
        zoom: floatCoalesce(url.searchParams.get('zoom'), 12),
      };
    }

    state = {
      camera,
      open: false,
    };
  }

  return <>
    <div className="flex flex-col h-full">
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
      {bannerContent ?? ''}
      <div className="flex grow overflow-hidden relative">
        <div
            className={
                (state.open ? "" : "hidden md:block ")
                    + "absolute bg-white inset-0 max-h-full overflow-y-scroll md:relative md:w-80"
            }
        >
          {sidebarContent}
        </div>
        <div className="grow h-full relative">
          <MapElement
              active={active}
              camera={state.camera}
              filters={filters}
              overlays={overlays}
              ref={ref}
          />
          {overlays?.content ?? <></>}
        </div>
      </div>
    </div>
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


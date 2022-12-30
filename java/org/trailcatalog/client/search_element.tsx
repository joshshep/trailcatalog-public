import * as corgi from 'js/corgi';
import { Link } from 'js/corgi/history/link_element';
import { FlatButton } from 'js/dino/button';
import { FabricIcon } from 'js/dino/fabric';
import { OutlinedInput } from 'js/dino/input';

import { currentUrl } from './common/ssr_aware';

import { BoundaryCrumbs } from './boundary_crumbs';
import { SearchController, State } from './search_controller';

export function SearchElement(
    props: {}, state: State|undefined, updateState: (newState: State) => void) {
  if (!state) {
    const search = currentUrl().searchParams;
    state = {
      boundaries: [],
      trails: [],
      query: search.get('query') ?? '',
    };
  }

  return <>
    <div
        className="relative"
        js={corgi.bind({
          controller: SearchController,
          state: [state, updateState],
        })}
    >
      <OutlinedInput
          className="border-tc-gray-400 peer w-96"
          icon="Search"
          inset={
            state.query
                ?  <FlatButton
                    className="bg-white -mr-2 -my-1 text-black"
                    unboundEvents={{
                      click: 'clearSearch',
                    }}
                    label={
                      <span className="whitespace-nowrap">
                        <span className="align-middle">Clear search</span>
                        {' '}
                        <FabricIcon
                            className="align-middle text-sm"
                            name="ChromeClose"
                        />
                      </span>
                    }
                />
                : ''
          }
          placeholder="Search trails or destinations"
          value={state.query}
          unboundEvents={{
            keyup: 'search',
          }}
      />
      {
        state.boundaries.length + state.trails.length > 0
            ? <SearchResults
                boundaries={state.boundaries}
                className="
                    hidden
                    leading-normal
                    active:block
                    focus-within:block
                    peer-focus-within:block"
                query={state.query}
                trails={state.trails} />
            : <></>
      }
    </div>
  </>;
}

function SearchResults({boundaries, className, query, trails}: {
  boundaries: State['boundaries'],
  className: string,
  query: string,
  trails: State['trails'],
}) {
  const nationalParks = boundaries.filter(b => isNationalParky(b.type));
  const nonParks = boundaries.filter(b => !isNationalParky(b.type));
  return <>
    <div
        className={`
          absolute
          bg-white
          inset-x-0
          overflow-y-scroll
          max-h-[85vh]
          px-3
          text-black
          top-full
          z-10
          ${className}
      `}
      tabIndex="-1"
    >
      <SearchCategory
          icon="/static/images/icons/trail.svg"
          label="Trails"
          results={trails.map(trail => <>
            <ResultItem
                boundaries={trail.boundaries}
                href={`/goto/trail/${trail.id}`}
                text={trail.name}
                query={query}
            />
          </>)}
      />
      <SearchCategory
          icon="/static/images/icons/national-park.svg"
          label="National Parks"
          results={nationalParks.map(boundary => <>
            <ResultItem
                boundaries={boundary.boundaries}
                href={`/search?boundary=${boundary.id}`}
                text={boundary.name}
                query={query}
            />
          </>)}
      />
      <SearchCategory
          icon="/static/images/icons/boundary-filled.svg"
          label="Areas"
          results={nonParks.map(boundary => <>
            <ResultItem
                boundaries={boundary.boundaries}
                href={`/search?boundary=${boundary.id}`}
                text={boundary.name}
                query={query}
            />
          </>)}
      />
    </div>
  </>;
}

function ResultItem({boundaries, href, text, query}: {
  boundaries: Array<{
    id: string;
    name: string;
    type: number;
  }>;
  href: string;
  text: string;
  query: string;
}) {
  return <>
    <div>
      <Link href={href}>
        <HighlightText haystack={text} needle={query} />
      </Link>
    </div>
    <div className="font-normal text-sm text-tc-gray-400">
      <BoundaryCrumbs boundaries={boundaries} />
    </div>
  </>;
}

function SearchCategory({icon, label, results}: {
  icon: string,
  label: string,
  results: corgi.VElementOrPrimitive[],
}) {
  return <>
    <div className="mt-3 space-y-3">
      <div className="flex font-bold gap-2 items-center">
        <img
            aria-hidden="true"
            src={icon}
            className="h-5"
        />
        {label}
      </div>
      {results.map(c => <>
        <div className="border-b font-header font-medium pb-2">
          {c}
        </div>
      </>)}
    </div>
  </>;
}

function HighlightText({needle, haystack}: {needle: string, haystack: string}) {
  const index = haystack.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) {
    return <span>{haystack}</span>;
  } else {
    const length = needle.length;
    return <>
      <span>{haystack.substr(0, index)}</span>
      <span className="font-bold">{haystack.substr(index, length)}</span>
      <span>{haystack.substr(index + length)}</span>
    </>;
  }
}

function isNationalParky(type: number): boolean {
  // TODO: keep this in sync with the Kotlin? Compile to JS?
  if (type === 68 || type === 4419) {
    return true;
  } else {
    return false;
  }
}

// A world with a save of its own, for any tool that builds more than one.
//
// Node has no `localStorage`, so the game falls back to an in-memory save that
// lasts as long as the process - and every `CityWorld` a tool built used to
// load the last one's. A run that drove past a parked car was put in it
// (#352), and the next run, and every run after it, started in that car
// instead, with its Rep and its finds. The Works Circuit's traffic lap read 22
// crashes when #489 recorded it (4 before) and none of that was the works: its
// own empty lap had just picked up the Monolith, and the traffic lap was
// driven in that. Started fresh it crashed 2 times. Which car a row was driven
// in depended on every row above it, so adding a route moved the numbers of
// every route after it (#533).
//
// A tool that builds one world, or only reads `.city` off one, does not need
// this: the city is the seed's, not the save's.

/**
 * `freshWorld(options)` builds a `CityWorld` on an empty save, the way a new
 * player starts. Loaded through the tool's own vite server, so the storage it
 * resets is the same module instance the world reads.
 */
export async function worldFactory(server) {
  const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
  const { memoryStore, setStore } = await server.ssrLoadModule('/src/game/storage.ts');
  const freshWorld = (options) => {
    setStore(memoryStore());
    return new CityWorld(undefined, options);
  };
  return { CityWorld, freshWorld };
}

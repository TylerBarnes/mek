# Mek

A DX/performance focused finite state machine package for TypeScript.

This package allows you to create readable and performant state machines.
The UML state machine spec is not followed. I've just created something I find useful for writing predictable/readable logic flows that loosely follows the concept of state machines. I don't care much about it being correct, only about it being useful and fast!

This library allows for extremely performant synchronous operations without blocking the event loop. Check the benchmark by running `pnpm run bench`. You'll see that using this library to write 20k files synchronously is much faster than doing the same in a while loop (sync or async!) and is slightly faster than doing it in a recursive function.

The benchmark is admittedly naive, but this is a personal project and I don't have the time to improve it too much. Perhaps one day I will make some proper benchmarks :)

## Usage

Check the examples/tests to see what it can do.

0. Install
   `pnpm install @tylerb/mek`

1. Create a machine

```ts
import { create } from "@tylerb/mek"

const ExampleMachine = create.machine(() => ({
  name: "ExampleMachine",
  // states: ...
}))
```

2. Create some states w/ lifecycles and add them to the machine

```ts
import { create, cycle } from "@tylerb/mek"

const ExampleMachine = create.machine(() => ({
  name: "ExampleMachine",

  states: {
    StateTwo,
    StateOne,
  },

  initialState: StateOne, // if this is omitted it will use object key order in the states object
}))

const StateOne = create.state(() => ({
  machine: ExampleMachine, // each state and machine reference each other so you can jump around your machine and states quickly with go-to-definition in your IDE!

  life: [
    cycle({
      name: "Give the state lifecycle a name (helps with debugging)",
      run: () => {
        console.log(`Each life cycle fn will run in order`)
      },
    }),

    cycle({
      name: "Ok moving over to state two",
      if: () => ExampleMachine.transitionCount < 10, // if you include an "if" function, the cycle will only run/thenGoTo if this returns true
      run: () => {
        // returning an object from any cycle will make it available in the next one on the "context" function argument
        return {
          hello: "there",
        }
      },
      thenGoTo: StateTwo,
    }),

    cycle({
      name: "Exit!",
      run: () => {
        ExampleMachine.stop()
      },
    }),
  ],
}))

const StateTwo = create.state(() => ({
  machine: ExampleMachine,

  life: [
    cycle({
      name: "Example two",
      if: ({ context }) => Boolean(context.hello),
      run: ({ context }) => {
        console.log(`hello ${context.hello}`)
      },
      thenGoTo: StateOne,
    }),
  ],
}))
```

3. Start your machine

```ts
ExampleMachine.start()
```

4. Debug

You can see roughly what your machine is doing by setting the env var `DEBUG_MEK=true`.

## Warning

This is a personal project that's pre-1.0.0. Any version can have a breaking change. If you feel like using this project anyway you should pin the version in your package.json to the latest version at the time you install it (ex `"@tylerb/mek": "0.0.1"`, notice no `~` or `^` before the version :)

import { create, cycle, effect } from "./mek"

describe(`cycle`, () => {
  it(`returns a valid state cycle definition`, async () => {
    const machine = create.machine(() => ({
      states: {
        TestState,
      },
    }))

    const TestState = create.state({
      machine,
      life: [],
    })

    expect(
      cycle({
        name: `test`,
        run: effect(() => {}),
        thenGoTo: () => TestState,
        condition: () => true,
      })
    ).toEqual({
      name: `test`,
      run: {
        type: `EffectHandler`,
        effectHandler: expect.any(Function),
      },
      thenGoTo: expect.any(Function),
      condition: expect.any(Function),
    })
  })

  test(`effect methods besides effect()/effect.wait() throw errors when passed to cycle.run() or when called outside of cycle.run()`, async () => {
    const machine = create.machine(() => ({
      states: {
        StateOne,
      },
    }))

    const StateOne = create.state({
      machine,
      life: [
        cycle({
          run: effect.onTransition(({}) => ({ value: null })),
        }),
      ],
    })

    await expect(machine.onStop()).rejects.toThrow(
      `Life cycle run must be an effect function. State: `
    )
  })

  it.todo(`fails if no name is provided`)

  it.todo(`cycle properties must be defined in a consistent order`)

  it.todo(`cycle names must be unique within each state`)
})

import { create, cycle, effect } from "./mek"

describe(`cycle`, () => {
it(`returns a valid state cycle definition`, async () => {
    const machine = create.machine(() => ({
      initial: () => machine.states.find(s => s.name === 'TestState'),
      states: {
        TestState: create.state(() => ({
          machine,
          life: [],
        })),
      },
    }))

    await machine.start()
    await machine.onStop()

    const TestState = machine.states.find(s => s.name === 'TestState')

    expect(
      cycle({
        name: `test`,
        effect: effect(() => {}),
        thenGoTo: () => TestState,
        condition: () => true,
      })
    ).toEqual({
      name: `test`,
effect: {
        type: `EffectHandler`,
        effectHandler: expect.any(Function),
      },
      thenGoTo: expect.any(Function),
      condition: expect.any(Function),
    })
  })

test(`effect methods besides effect()/effect.wait() throw errors when passed to cycle.effect() or when called outside of cycle.effect()`, async () => {
    const machine = create.machine(() => ({
      initial: () => machine.states.find(s => s.name === 'StateOne'),
      states: {
        StateOne: create.state(() => ({
          machine,
          life: [
            cycle({
effect: effect.onTransition(({}) => ({ value: null })),
            }),
          ],
        })),
      },
    }))

    await expect(
      machine.onStop({
        start: true,
      })
    ).rejects.toThrow(
      `Life cycle effect must be a function or an effect function. State:`
    )
  })

it(`cycle.decide is a function that decides whether or not thenGoTo is called`, () => {
    const machine = create.machine(() => ({
      initial: () => machine.states.find(s => s.name === 'TestState'),
      states: {
        TestState: create.state(() => ({
          machine,
          life: [],
        })),
      },
    }))

    const TestState = machine.states.find(s => s.name === 'TestState')
    const decision = cycle.decide(() => true, TestState)
    
    expect(decision).toEqual({
      if: expect.any(Function),
      thenGoTo: expect.any(Function),
    })
    
    // Test that the condition function works
    expect(decision.if({ context: {} })).toBe(true)
    
    // Test that the thenGoTo function returns the state
    expect(decision.thenGoTo()).toBe(TestState)
  })

  it.todo(`fails if no name is provided`)

  it.todo(`cycle properties must be defined in a consistent order`)

  it.todo(`cycle names must be unique within each state`)

  it.todo(`thenGoTo function cannot contain conditional logic`)
})

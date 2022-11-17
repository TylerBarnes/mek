import { createMachine, effect, cycle } from "./index"

console.log(`


-------`)

const lightMachine = createMachine(() => ({
  states: {
    RedLight,
    GreenLight,
    YellowLight,
  },

  signals: {
    onLightColourChange,
    onGreenLightTransition,
  },
}))

const GreenLight = lightMachine.state({
  life: [
    cycle({
      run: effect.wait(3),
    }),
    cycle({
      name: `Go to yellow light`,
      run: effect.wait(2),
      thenGoTo: () => YellowLight,
    }),
  ],
})

const YellowLight = lightMachine.state({
  life: [
    cycle({
      name: `Go to red light`,
      run: effect.wait(1),
      thenGoTo: () => RedLight,
    }),
  ],
})

const RedLight = lightMachine.state({
  life: [
    cycle({
      name: `Go to green light`,
      run: effect.wait(2),
      thenGoTo: () => GreenLight,
    }),
  ],
})

const onLightColourChange = lightMachine.signal(
  effect.onTransition(({ currentState }) => {
    return { value: currentState.name }
  })
)

const onGreenLightTransition = lightMachine.signal(
  effect.onTransition(({ currentState }) => {
    if (currentState.name === `GreenLight`) {
      return { value: currentState.name }
    }

    return null
  })
)

onLightColourChange(({ value }) => {
  console.log(`yo`, value)
})

onGreenLightTransition(() => {
  console.log(`green light dope dude`)
})

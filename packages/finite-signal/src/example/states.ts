import { cycle, effect, create } from "../mek"
import { lightMachine } from "./machine"

export const GreenLight = create.state(() => ({
  machine: lightMachine,
  signals: {
    emoji: `🟢`,
    canIWalk: true,
  },
  life: [
    // cycle({
    // 	name: `Start child machine`,
    // 	condition: true,
    // 	run: effect.createChildMachine()
    // }),
    cycle({
      run: () => {
        console.log(`🟢`)
      },
    }),
    cycle({
      run: effect.wait(3),
    }),
    cycle({
      run: () => {
        console.log(`🟢 2`)
      },
    }),
    cycle({
      name: `Go to yellow light`,
      run: effect.wait(3),
      // decide: () => {},
      thenGoTo: YellowLight,
    }),
    // @ts-ignore
    // cycle.onRequestState({
    //   name: `When emergency mode is requested, wait for current state cycle to finish before going there`,
    //   // condition: () => stuff
    //   // @ts-ignore
    //   allowRequestedStates: () => [EmergencyBlink],
    //   // run: effect
    //   //   // @ts-ignore
    //   //   .waitFor(GreenLight.onDone()),
    //   // default
    //   // decide: () => true,
    // }),
    // cycle({
    //   name: `Wait for input signals for max 10 seconds, then go to yellow light`,
    //   run: effect(() => {
    //     console.log(`GreenLight`)
    //   })
    //     // @ts-ignore
    //     .waitForSignal(() => [pressWalkButton, roadPressureSensor])
    //     .timeout(10)
    //     .decide(({ input, Wait, Proceed }) => {
    //       if (input.something) {
    //         return Wait
    //       }
    //       return Proceed
    //     }),
    //   thenGoTo: YellowLight,
    // }),
  ],
}))

export const YellowLight = create.state(() => ({
  machine: lightMachine,
  signals: {
    emoji: `🟡`,
    canIWalk: false,
  },
  life: [
    cycle({
      run: create.effect(() => {
        console.log(`🟡`)
      }),
    }),
    cycle({
      name: `Go to red light`,
      run: create.effect.wait(3),
      // if: YellowLight.signals.emoji.is(`🟡`),
      // decide: YellowLight.if.signals.emoji.is(`🟡`),
      // decide: YellowLight.maybe.signals.emoji.is(`🟡`),
      // decide: cycle.maybe(YellowLight.signals.emoji, cycle.maybe.is(`🟡`)),
      thenGoTo: RedLight,
    }),
  ],
}))

export const RedLight = create.state(() => ({
  machine: lightMachine,
  signals: {
    emoji: `🛑`,
    canIWalk: false,
  },
  life: [
    cycle({
      run: effect(() => {
        console.log(`🛑`)
      }),
    }),
    cycle({
      name: `Go to green light`,
      run: effect.wait(2),
      thenGoTo: GreenLight,
    }),
  ],
}))

// // @ts-ignore
// export const onLightColourChange = create.signal({
//   machine: lightMachine,
//   condition: () => {},
//   run: effect.onTransition(({ currentState }) => {
//     return { value: currentState.name }
//   }),
// })

// // @ts-ignore
// export const pressWalkButton = create.signal({
//   machine: lightMachine,
//   condition: () => {},
//   run: effect
//     // @ts-ignore
//     .requestState(() => RedLight)
//     .then(({ response }) => {
//       return response
//     }),
// })

// // @ts-ignore
// export const getStopLightStats = create.signal({
//   machine: lightMachine,
//   condition: () => {},
//   // @ts-ignore
//   run: effect.getValues(({ machine }) => {
//     return machine.transitionCount
//   }),
// })

// export const onGreenLightTransition = lightMachine.signal(
//   effect.onTransition(({ currentState }) => {
//     if (currentState.name === `GreenLight`) {
//       return { value: currentState.name }
//     }

//     return null
//   })
// )

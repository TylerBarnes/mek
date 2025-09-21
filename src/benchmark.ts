import { create, cycle } from "./mek.js"
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iterationMax = 20_000
const startTime = Date.now()
let counter = 0

const machine = create.machine(() => ({
  states: {
    StateOne,
  },

  options: {
    maxTransitionsPerSecond: iterationMax,
  },
}))

let StateOne = create.state(() => ({
  machine,
  life: [
    cycle({
      name: `only cycle`,
      if: () => counter <= iterationMax - 1,
      run: () => {
        counter++
        let temp = 'hello world'; // In-memory operation
      },
      thenGoTo: StateOne,
    }),
  ],
}))

machine.start()

machine
  .onStop()
  .finally(() => {
    const endTime = Date.now() - startTime

    console.log({
      benchmark: "mek",
      transitionCount: counter,
      duration: `${endTime}ms`,
    })
    })
  .finally(async () => {
    const loopBench = () => {
      let count2 = 0
      const start2 = Date.now()

      while (count2 < iterationMax) {
        count2++
        let temp = 'hello world'; // In-memory operation
      }
      const duration2 = Date.now() - start2
      console.log({
        benchmark: "whileLoop",
        transitionCount: count2,
        duration: `${duration2}ms`,
      })

      let asyncCount = 0
      const asyncStart = Date.now()

      while (asyncCount < iterationMax) {
        asyncCount++
        let temp = 'hello world'; // In-memory operation
      }
      const asyncDuration = Date.now() - asyncStart
      console.log({
        benchmark: "whileLoopAsync",
        transitionCount: asyncCount,
        duration: `${asyncDuration}ms`,
      })
    }

    let count = 0
    const start = Date.now()

    function yo() {
      if (count >= iterationMax) {
        const recursiveDuration = Date.now() - start
        console.log({
          benchmark: "recursiveFn",
          transitionCount: count,
          duration: `${recursiveDuration}ms`,
        })
        loopBench()
        return
      }
      count++
      let temp = 'hello world'; // In-memory operation

      if (count % 200 === 0) {
        setImmediate(() => yo())
      } else {
        yo()
      }
    }

    yo()
  })

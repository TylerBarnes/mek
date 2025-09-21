# Mek API Improvement Plan

## Priority Order (Top to Bottom)

### 1. Cycle API Improvements
**File: `src/cycle.spec.ts`**

#### 1.1 `cycle.decide` function
- **Implementation**: Add `cycle.decide(condition, nextState)` function
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing conditional transitions
- **Docs**: Document in README.md

#### 1.2 Failure if no name is provided
- **Implementation**: Validate cycle names in `cycle()` function
- **Tests**: Update `it.todo` to actual test
- **Example**: Show error case in example
- **Docs**: Document validation requirements

#### 1.3 Consistent property order
- **Implementation**: Ensure cycle properties are always in same order
- **Tests**: Update `it.todo` to actual test
- **Example**: Demonstrate consistent ordering
- **Docs**: Document property order

#### 1.4 Unique cycle names
- **Implementation**: Validate unique cycle names within a state
- **Tests**: Update `it.todo` to actual test
- **Example**: Show error case for duplicate names
- **Docs**: Document uniqueness requirement

#### 1.5 `thenGoTo` function cannot contain conditional logic
- **Implementation**: Validate `thenGoTo` is static state reference
- **Tests**: Update `it.todo` to actual test
- **Example**: Show error case for conditional logic
- **Docs**: Document static requirement

### 2. Effect API Improvements
**File: `src/effect.spec.ts`**

#### 2.1 `effect.waitForSignal`
- **Implementation**: Add `effect.waitForSignal(signalName)` function
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing signal waiting
- **Docs**: Document signal waiting in README.md

#### 2.2 `effect.waitFor` (promise)
- **Implementation**: Add `effect.waitFor(promise)` function
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing promise waiting
- **Docs**: Document promise waiting in README.md

#### 2.3 `effect.timeout`
- **Implementation**: Add `effect.timeout(duration)` function
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing timeout behavior
- **Docs**: Document timeout functionality in README.md

#### 2.4 `effect.decide` (condition for `waitForSignal`)
- **Implementation**: Add `effect.decide(condition)` for signal filtering
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing conditional signal handling
- **Docs**: Document conditional signal handling

#### 2.5 `effect.lazy()`
- **Implementation**: Add `effect.lazy()` for lazy effect evaluation
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing lazy effects
- **Docs**: Document lazy evaluation in README.md

#### 2.6 `effect.wait()` with no arguments
- **Implementation**: Add `effect.wait()` for immediate continuation
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing immediate continuation
- **Docs**: Document immediate continuation

#### 2.7 `effect.stop(machine)`
- **Implementation**: Add `effect.stop(machine)` for stopping machines
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing machine stopping
- **Docs**: Document machine stopping in README.md

#### 2.8 Effect chaining
- **Implementation**: Add ability to chain multiple effects
- **Tests**: Update `it.todo` to actual test
- **Example**: Create example showing effect chaining
- **Docs**: Document effect chaining in README.md

### 3. Signal API Improvements
**File: `src/signal.spec.ts`**

#### 3.1 `signal(effect.waitForAnySequence())`
- **Implementation**: Add `signal.waitForAnySequence()` for multiple signal handling
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing any sequence handling
- **Docs**: Document any sequence handling in README.md

#### 3.2 `signal(effect.waitForOrderedSequence())`
- **Implementation**: Add `signal.waitForOrderedSequence()` for ordered signal handling
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing ordered sequence handling
- **Docs**: Document ordered sequence handling in README.md

#### 3.3 Signals defined on individual states overriding machine signals
- **Implementation**: Allow state-specific signal definitions
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing state signal overriding
- **Docs**: Document signal overriding in README.md

#### 3.4 Signals as serializable immutable values
- **Implementation**: Ensure signals are serializable and immutable
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing serialization
- **Docs**: Document serialization requirements

#### 3.5 `signal` effects queuing state transitions with `effect.requestState()` and `cycle.onRequest()`
- **Implementation**: Add `effect.requestState()` and `cycle.onRequest()` for queued transitions
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing queued transitions
- **Docs**: Document queued transitions in README.md

### 4. Machine API Improvements
**File: `src/machine.spec.ts`**

#### 4.1 State/machine storage
- **Implementation**: Add storage for states and machines
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing storage usage
- **Docs**: Document storage in README.md

#### 4.2 Linked machines
- **Implementation**: Add ability to link machines together
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing linked machines
- **Docs**: Document linked machines in README.md

#### 4.3 Forked state trees
- **Implementation**: Add ability to fork state trees
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing state tree forking
- **Docs**: Document state tree forking in README.md

#### 4.4 Plugins
- **Implementation**: Add plugin system for extending functionality
- **Tests**: Update `test.todo` to actual test
- **Example**: Create example showing plugin usage
- **Docs**: Document plugin system in README.md

## Implementation Strategy

1. **Start with Priority 1** (Cycle improvements) - these are foundational
2. **Each feature requires**:
   - Implementation in `src/mek.ts`
   - Test updates in respective `.spec.ts` files
   - Example in `examples/` directory
   - Documentation updates in `README.md`
3. **Run tests after each feature** to ensure no regressions
4. **Commit changes** after each complete feature implementation

## Current Status
- ✅ ES Module modernization completed
- ✅ Basic error message format fixes
- 🔄 Ready to start API improvements
- 🚧 Tests still failing - need to fix before starting new features
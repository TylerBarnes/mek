# Product Requirements Document: Schema Validation for Mek

## Executive Summary

Add optional runtime schema validation using the **Standard Schema** interface to ensure type safety and data integrity across state transitions. This feature will provide developers with compile-time type inference and runtime validation for data flowing through their state machines, while allowing them to choose their preferred validation library (Zod, Valibot, etc.).

## State Transition Mapping

Support mapping output data from one state to the input shape required by the next state. This ensures seamless data flow between states with different schema requirements while maintaining type safety.

## Background & Motivation

Currently, Mek allows arbitrary data to flow between lifecycle callbacks (`if`, `run`, `shouldGo`) without validation. While TypeScript provides compile-time type checking, there's no runtime guarantee that:
- External data matches expected shapes
- State transitions receive valid inputs
- Outputs from one state match inputs for the next state
- API responses or user inputs conform to expected schemas

This can lead to:
- Runtime errors in production
- Difficult-to-debug state machine failures
- Inconsistent data flow between states
- Lack of self-documenting state contracts

## Proposed Solution

### Technology Choice: Standard Schema Interface

After evaluating multiple approaches, we will implement the **Standard Schema** specification, which provides:

. **Library Agnostic**: Users can choose any Standard Schema compatible library
. **Zero Dependencies**: No validation library forced on users
. **Future Proof**: New validation libraries automatically work
. **Type Safety**: Full TypeScript inference regardless of library choice
. **Performance Flexibility**: Users can optimize for bundle size or speed

### Recommended Validation Libraries

Users can choose based on their priorities:

#### **Valibot** (Recommended for Performance)
- **Bundle size**: ~700 bytes min (up to 95% smaller than Zod)
- **Performance**: ~2x faster than Zod
- **Tree-shakeable**: Only include what you use
- **TypeScript-first**: Excellent type inference

#### **Zod** (Recommended for Ecosystem)
- **Bundle size**: ~14KB minified+gzipped
- **Ecosystem**: Largest community, most integrations
- **DX**: Most familiar API for developers
- **Features**: Most comprehensive feature set

#### Other Compatible Libraries
- **ArkType**: Type syntax closer to TypeScript
- **Yup**: Popular in React ecosystem
- **TypeBox**: JSON Schema compatible

## Feature Design

### Core Concepts

1. **Schema Definition**: Each state can optionally define input/output schemas
2. **Automatic Validation**: Schemas are validated at runtime during transitions
3. **Type Inference**: TypeScript types are automatically inferred from schemas
4. **Progressive Enhancement**: Schemas are completely optional - existing code works unchanged

### API Design

```typescript
import { v } from 'valibot'; // or z from 'zod'
import { create } from '@tylerb/mek';

// Define schemas for state data using any Standard Schema library
const LoginSchema = v.object({
  username: v.pipe(v.string(), v.minLength(3)),
  password: v.pipe(v.string(), v.minLength(8))
});
```
```
```

const UserSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email())
});

// Create states with schemas
const LoginState = create.state({
  name: 'login',
  input: LoginSchema,
  output: UserSchema,
  lifecycle: create.cycle({
    effect: async (context) => {
      // context.data is typed as LoginSchema output
      const user = await api.login(context.data);
      return user; // Must match UserSchema or validation fails
    },
    thenGoTo: 'dashboard'
  })
});

const DashboardState = create.state({
  name: 'dashboard',
  input: UserSchema, // Ensures data from LoginState is valid
  lifecycle: create.cycle({
    effect: async (context) => {
      // context.data is typed as UserSchema
      console.log(`Welcome ${context.data.name}!`);
    }
  })
});
```
```

### Data Mapping Between States

When states have different input/output schemas, lifecycles can map data using the `prepare` function in `thenGoTo`:

```typescript
const ProfileState = create.state({
  name: 'profile',
  input: v.object({
    userId: v.string(),
    displayName: v.string()
  }),
  lifecycle: create.cycle({
    effect: async (context) => {
      // Load profile data
    }
  })
});

const DashboardState = create.state({
  name: 'dashboard',
  input: UserSchema,
  output: UserSchema, // Output is still UserSchema
  lifecycle: create.cycle({
    effect: async (context) => {
      // Process user data, return the full user
      return context.data;
    },
    thenGoTo: {
      state: 'profile',
      prepare: (output) => ({
        // Map UserSchema to ProfileState's expected input
        userId: output.id,
        displayName: output.name
      })
    }
  })
});
```

### Type Inference with thenGoTo

TypeScript will automatically infer and enforce schema compatibility:

```typescript
const StateA = create.state({
  name: 'stateA',
  output: v.object({ value: v.number() }),
  lifecycle: create.cycle({
    effect: () => ({ value: 42 }),
    thenGoTo: 'stateB' // TS error if StateB.input doesn't match StateA.output
  })
});

const StateB = create.state({
  name: 'stateB',
  input: v.object({ value: v.number() }), // Must match StateA.output
  lifecycle: create.cycle({
    effect: (context) => {
      console.log(context.data.value); // Typed as number
    }
  })
});
```

### Schema Validation Points

. **State Entry**: Validate input data when transitioning to a state
. **After `effect`**: Validate output from `effect` callback
. **Before `shouldGo`**: Ensure `shouldGo` receives validated data
. **Before `prepare`**: Validate data before transformation in `thenGoTo.prepare`
. **State Exit**: Validate transformed data being passed to next state

### Error Handling

```typescript
const machine = create.machine({
  states: [LoginState, DashboardState],
  onError: (error, context) => {
    // Custom error handling for schema validation errors
    if (error instanceof SchemaValidationError) {
      console.error('Schema validation failed:', error.message);
      console.error('Invalid data:', error.data);
      console.error('Schema issues:', error.issues);
      
      // Optionally transition to error state
      return 'error';
    }
    
    // Handle other errors
    console.error('Machine error:', error);
    return 'error';
  }
});
```
```
```

```

### Development Mode Features

- **Strict Mode**: Fail on any schema violations
- **Warning Mode**: Log violations but continue execution
- **Schema Inference Helper**: Auto-generate schemas from runtime data

## Implementation Plan

### Phase 1: Core Schema Support (Week 1)
- [ ] Add Standard Schema types and interfaces
- [ ] Extend State type to accept `input` and `output` schemas
- [ ] Implement validation at state entry/exit points
- [ ] Add TypeScript type inference from schemas
- [ ] Ensure `thenGoTo` type inference works with output schemas

### Phase 2: Data Mapping & Type Safety (Week 2)
- [ ] Implement output-to-input data mapping in lifecycles
- [ ] Add TypeScript enforcement for schema compatibility
- [ ] Support conditional transitions with `shouldGo` and schemas
- [ ] Create comprehensive test suite with multiple validation libraries

### Phase 3: Documentation & Examples (Week 3)
- [ ] Write migration guide for existing users
- [ ] Create examples with Valibot (performance)
- [ ] Create examples with Zod (ecosystem)
- [ ] Document best practices for data mapping
- [ ] Add JSDoc comments for IDE support

## Success Metrics

. **Zero Breaking Changes**: Existing code works without modification
. **Performance Impact**: < 5% overhead when schemas are used (Valibot preferred)
. **Bundle Size**: Zero increase when no schemas used, minimal increase when used
. **Type Safety**: 100% type inference accuracy between states
. **Developer Experience**: Schema definition in < 5 lines of code
. **Library Compatibility**: Works with all Standard Schema libraries

## Open Questions for Discussion

. **Data Mapping**: How should we handle complex data transformations between states?
   - Automatic mapping based on field names?
   - Explicit mapping functions in lifecycles?
   - Both options available?

. **Default Behavior**: Should validation be strict by default or opt-in?
   - Strict: Fail fast in development
   - Warning: Log but continue
   - Configurable per environment

. **Schema Composition**: Should we provide utilities for composing/extending schemas?
   - Base schemas that states can extend
   - Schema inheritance between related states

. **Async Validation**: Should we support async validators?
   - Database uniqueness checks
   - External API validation
   - Performance implications

. **Transform Support**: Should schemas transform data or only validate?
   - Coercion (string → number)
   - Default values
   - Data sanitization

. **Error Recovery**: What should happen when validation fails?
   - Transition to error state
   - Stay in current state
   - Configurable per state

. **Type Inference Edge Cases**: How to handle conditional types with `shouldGo`?
   - Multiple possible output types based on conditions
   - Union types for outputs

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bundle size increase | Low | Zero increase when unused, minimal when used due to Standard Schema |
| Performance overhead | Low | Cache compiled schemas, allow opt-out in production |
| API complexity | Medium | Keep simple things simple, progressive disclosure |
| Breaking changes | High | Ensure 100% backward compatibility, extensive testing |
| Type inference complexity | Medium | Thoroughly test with various schema libraries |

## Alternative Approaches Considered

. **Custom Validation**: Build our own micro-validation library
   - Pros: Smaller bundle, perfect fit
   - Cons: Maintenance burden, less features
   - **Decision**: Rejected - Standard Schema provides better ecosystem

. **Single Library (Zod-only)**: Support only Zod
   - Pros: Simpler implementation, well-known
   - Cons: Forces dependency, larger bundle
   - **Decision**: Rejected - Standard Schema gives users choice

. **TypeScript-Only**: Use only TypeScript types without runtime validation
   - Pros: Zero runtime cost
   - Cons: No runtime safety, doesn't solve the core problem
   - **Decision**: Rejected - Runtime validation is the core requirement

## Conclusion

Implementing schema validation using the **Standard Schema** interface provides the perfect balance:

- **Zero forced dependencies**: Users choose their validation library
- **Performance flexibility**: Use Valibot for minimal overhead
- **Ecosystem compatibility**: Works with existing tools
- **Type safety**: Full TypeScript inference between states
- **Data mapping**: Seamless transformation between different state schemas

The implementation will be completely backward compatible and optional, allowing users to adopt schemas gradually as needed. The Standard Schema approach future-proofs Mek while maintaining its core philosophy of simplicity and performance.
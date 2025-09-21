# Product Requirements Document: Schema Validation for Mek

## Executive Summary

Add optional runtime schema validation to Mek's lifecycle callbacks to ensure type safety and data integrity across state transitions. This feature will provide developers with compile-time type inference and runtime validation for data flowing through their state machines.

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

### Technology Choice: Zod

After evaluating multiple schema validation libraries, **Zod** is recommended for the following reasons:

1. **TypeScript-first design**: Automatic type inference from schemas
2. **Developer experience**: Clean, intuitive API that aligns with Mek's philosophy
3. **Bundle size**: ~12-14KB minified+gzipped (reasonable for the value provided)
4. **Performance**: Good balance of speed vs features
5. **Ecosystem**: Wide adoption, excellent documentation, active maintenance
6. **Composability**: Schemas can be composed and extended easily

### Alternative Considered:
- **Valibot**: Smaller bundle (3KB) but less mature ecosystem
- **TypeBox**: JSON Schema compatible but more verbose API
- **Yup**: Popular but less TypeScript-focused, larger bundle
- **AJV**: Fast but requires separate type definitions

## Feature Design

### Core Concepts

1. **Schema Definition**: Each state can optionally define input/output schemas
2. **Automatic Validation**: Schemas are validated at runtime during transitions
3. **Type Inference**: TypeScript types are automatically inferred from schemas
4. **Progressive Enhancement**: Schemas are completely optional - existing code works unchanged

### API Design

```typescript
import { z } from 'zod';
import { create } from '@tylerb/mek';

// Define schemas for state data
const LoginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8)
});

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email()
});

// Create states with schemas
const LoginState = create.state({
  name: 'login',
  schema: {
    input: LoginSchema,
    output: UserSchema
  },
  lifecycle: create.cycle({
    run: async (context) => {
      // context.data is typed as LoginSchema
      const user = await api.login(context.data);
      return user; // Must match UserSchema or validation fails
    },
    thenGoTo: 'dashboard'
  })
});

const DashboardState = create.state({
  name: 'dashboard',
  schema: {
    input: UserSchema // Ensures data from LoginState is valid
  },
  lifecycle: create.cycle({
    run: async (context) => {
      // context.data is typed as UserSchema
      console.log(`Welcome ${context.data.name}!`);
    }
  })
});
```

### Schema Validation Points

1. **State Entry**: Validate input data when transitioning to a state
2. **After `run`**: Validate output from `run` callback
3. **Before `shouldGo`**: Ensure `shouldGo` receives validated data
4. **State Exit**: Validate data being passed to next state

### Error Handling

```typescript
const machine = create.machine({
  states: [LoginState, DashboardState],
  onSchemaError: (error, context) => {
    // Custom error handling
    console.error('Schema validation failed:', error);
    // Optionally transition to error state
    return 'error';
  }
});
```

### Development Mode Features

- **Strict Mode**: Fail on any schema violations
- **Warning Mode**: Log violations but continue execution
- **Schema Inference Helper**: Auto-generate schemas from runtime data

## Implementation Plan

### Phase 1: Core Schema Support (Week 1)
- [ ] Add Zod as optional peer dependency
- [ ] Extend State type to accept schema definitions
- [ ] Implement validation at state entry/exit points
- [ ] Add TypeScript type inference from schemas

### Phase 2: Enhanced Features (Week 2)
- [ ] Add schema composition utilities
- [ ] Implement development mode helpers
- [ ] Add performance optimizations (schema compilation)
- [ ] Create comprehensive test suite

### Phase 3: Documentation & Examples (Week 3)
- [ ] Write migration guide for existing users
- [ ] Create example projects with schemas
- [ ] Document best practices
- [ ] Add JSDoc comments for IDE support

## Success Metrics

1. **Zero Breaking Changes**: Existing code works without modification
2. **Performance Impact**: < 5% overhead when schemas are used
3. **Bundle Size**: Total increase < 15KB when Zod is included
4. **Type Safety**: 100% type inference accuracy
5. **Developer Experience**: Schema definition in < 5 lines of code

## Open Questions for Discussion

1. **Schema Library Choice**: Should we support multiple validation libraries or focus on Zod?
2. **Default Behavior**: Should validation be strict by default or opt-in?
3. **Schema Sharing**: Should we provide utilities for sharing schemas between states?
4. **Async Validation**: Should we support async validators (e.g., database checks)?
5. **Transform Support**: Should schemas be able to transform data (coercion, defaults)?
6. **Error Recovery**: What should happen when validation fails - stop, skip, or error state?
7. **Performance Mode**: Should we allow disabling validation in production for performance?

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bundle size increase | Medium | Make Zod a peer dependency, tree-shake unused features |
| Performance overhead | Low | Cache compiled schemas, allow opt-out in production |
| API complexity | Medium | Keep simple things simple, progressive disclosure |
| Breaking changes | High | Ensure 100% backward compatibility, extensive testing |

## Alternative Approaches Considered

1. **Custom Validation**: Build our own micro-validation library
   - Pros: Smaller bundle, perfect fit
   - Cons: Maintenance burden, less features

2. **Multiple Library Support**: Support Zod, Yup, Valibot, etc.
   - Pros: User choice, flexibility
   - Cons: Complex API, larger maintenance surface

3. **TypeScript-Only**: Use only TypeScript types without runtime validation
   - Pros: Zero runtime cost
   - Cons: No runtime safety, doesn't solve the core problem

## Conclusion

Adding schema validation to Mek will significantly improve the developer experience and runtime safety of state machines. Zod provides the best balance of features, performance, and developer experience for this use case.

The implementation will be completely backward compatible and optional, allowing users to adopt schemas gradually as needed.
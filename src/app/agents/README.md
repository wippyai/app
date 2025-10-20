# Wippy Agent System Documentation

## Overview

The Wippy Agent System is a modular AI orchestration framework built on the **userspace.dataflow.flow** library. It provides specialized agent subsystems for complex problem-solving, content generation, task distribution, and platform development coordination.

## Architecture

### Core Components

```
src/app/agents/
├── _index.yaml              # Wippy Meta Agent (primary entry point)
├── reasonflow/              # Deep reasoning and decomposition system
├── writer/                  # Content generation with critique loop
├── distribute/              # Parallel task distribution system
├── keeper_v2/              # Development coordination system
└── traits/public/          # Public agent routing
```

### Flow-Based Orchestration

All agent systems use the **userspace.dataflow.flow** library for workflow orchestration:

```lua
flow.create()
  :with_input({...})           -- Initial input
  :to(step_name)               -- Route to next step
  :agent(agent_id, config)     -- Execute agent
  :as(name)                    -- Name output
  :cycle(config)               -- Iterative loop (max iterations, state management)
  :map_reduce(config)          -- Parallel execution with aggregation
  :func(function_id, config)   -- Call utility function
  :run()                       -- Execute entire flow
```

#### Key Flow Builder Concepts

**Routing:**
- Automatic chaining: nodes connect sequentially unless `:to()` specified
- Conditional routing: `:when("output.score > 0.8")`
- Terminal nodes: `@success` and `@fail` for explicit completion
- Transform on route: `:to("target"):transform("output.data.field")`

**Node Types:**
- `:func()` - Call Lua functions with input/output handling
- `:agent()` - Execute LLM agents with arena configuration
- `:cycle()` - Iterative loops with state management (exit via `continue = false`)
- `:map_reduce()` - Parallel processing with batch control and aggregation

**Agent Arena:**
```lua
:agent("namespace:agent_id", {
  arena = {
    prompt = "System instructions",
    max_iterations = 10,
    tool_calling = "auto",      -- "auto", "any", "none"
    exit_schema = {...}         -- Creates automatic "finish" tool
  }
})
```

**Cycle Pattern:**
```lua
-- Cycle function receives:
{iteration = N, input = {...}, state = {...}, last_result = {...}}

-- Must return:
{state = {...}, result = {...}, continue = boolean}
```

**Expression Language:**
- Operators: `+`, `-`, `*`, `/`, `==`, `!=`, `<`, `>`, `&&`, `||`, `!`, `? :`
- Optional chaining: `output?.field?.nested`
- Null coalescing: `value ?? default`
- Functions: `len()`, `filter()`, `map()`, `upper()`, `lower()`, etc.

**Context Variables:**
- `input` - workflow input (in `:with_input()` routes)
- `output` - node output (in `:to()` routes)
- `error` - error object (in `:error_to()` routes)
- `inputs` - multiple inputs (in node `input_transform`)

**Execution Context:**

Flow behavior depends on where it's called:

**Called from outside workflow** (e.g., tool handler):
```lua
function handler(args)
  return flow.create()
    :with_input(args)
    :func("process")
    :run()  -- Creates NEW workflow
end
```
- `:run()` compiles flow and creates a new workflow
- `@success`/`@fail` terminate the workflow
- Returns result to caller

**Called from inside workflow** (e.g., cycle function):
```lua
function cycle_handler(cycle_context)
  return flow.create()
    :with_input(cycle_context.state)
    :func("step1")
    :func("step2")
    :run()  -- Embeds as subgraph in parent workflow
end
```
- Flow embeds as inline subgraph (like pipeline in pipeline)
- `@success`/`@fail` return to parent as `NODE_OUTPUT`
- Inherits parent's workflow context (`session_parent_id`)

**Template Inlining:**
```lua
:cycle({
  template = flow.template()  -- NOT :run()
    :func("step1")
    :func("step2")
})
```
- Template nodes get `parent_node_id` set
- Become part of parent's node graph
- No separate workflow created

**Key Points:**
- Each `:run()` outside workflow = new workflow execution
- `:run()` inside workflow = embedded subgraph
- Templates (`:use()`, cycle/map-reduce templates) = inlined nodes
- State persists across cycle iterations via the `state` field

---

## Agent Systems

### 1. Wippy Meta Agent

**Location**: `src/app/agents/_index.yaml`

**Purpose**: Primary user-facing agent within the Wippy environment.

**Configuration**:
- Model: `gpt-4.1`
- Max tokens: 4000
- Temperature: Default

**Capabilities**:
- Routes requests through exposed tools/traits
- Delegates complex requests to specialist systems
- Limits clarifying questions (≤2)
- Uses native capabilities before delegation
- Maintains implementation opacity

**Traits**:
- `web_researcher`: Web search and content retrieval
- `file_manager`: File upload and analysis
- `researcher`: Research delegation
- `user_aware`: User context awareness
- `public_router`: Routes to public agents
- `platform_overview`: Platform knowledge

---

### 2. ReasonFlow System

**Location**: `src/app/agents/reasonflow/`

**Purpose**: Complex problem-solving through decomposition, parallel reasoning, and synthesis.

#### Agents

1. **main_agent** - Entry point agent
2. **decomposer_agent** - Breaks tasks into 2-8 logical pieces
3. **decomposition_qa_agent** - Validates decomposition completeness
4. **reasoning_agent** - Deep reasoning on individual pieces
5. **reasoning_qa_agent** - Validates reasoning quality
6. **synthesis_agent** - Synthesizes pieces into final answer

#### Configuration

- Model: `gpt-5-mini` (most agents)
- Temperature: 0.2-0.4 (analytical focus)
- Max tokens: 8000-20000

#### Workflow

**Entry point**: `reason_task.lua`

```
Input Task
  ↓
:cycle (decomposition_loop, max 4 iterations)
  → decomposer_agent → decomposition_qa_agent → collector
  ↓ (if approved, exits; otherwise repeats with feedback)
:map_reduce (parallel_reasoning, batch_size 4)
  → For each piece, :cycle (reasoning_loop, max 3 iterations)
    → reasoning_agent → reasoning_qa_agent → collector
  ↓ (collects all approved reasoning)
:agent (synthesis_agent)
  → Integrates all pieces into final markdown response
  ↓
Output: Comprehensive synthesized answer
```

#### Files

- `reason_task.lua` - Entry point tool for reasoning
- `decomposition_cycle.lua` - Task decomposition cycle
- `reasoning_cycle.lua` - Parallel reasoning cycles
- `decomposition_collector.lua` - Decomposition result collector
- `reasoning_collector.lua` - Reasoning result collector

#### Use Cases

- Deep analysis requiring multi-faceted exploration
- Research tasks with multiple dimensions
- Complex problem decomposition and synthesis
- Thorough investigation of interconnected topics

---

### 3. Writer System

**Location**: `src/app/agents/writer/`

**Purpose**: High-quality content generation with iterative critique and AI slop elimination.

#### Agents

1. **content_agent** - User-facing entry point
2. **writer_agent** - Creative content writer
3. **critique_agent** - Grok-based quality assurance

#### Configuration

- Writer model: `gpt-5` (temperature: 0.4-0.7)
- Critique model: `grok-4` (temperature: 0.2)
- Max tokens: 8000-16000

#### Workflow

**Entry point**: `write_content.lua`

```
Input: {topic, style, min_score}
  ↓
:cycle (write_cycle, max 4 iterations)
  → writer_agent (generates content with previous feedback)
  ↓
  → critique_agent (scores content, flags AI slop patterns)
  ↓
  → collector (accumulates feedback history)
  ↓ (if approved and score >= min_score, exits; otherwise repeats)
Output: Polished content without AI slop
```

#### Quality Criteria

The critique agent evaluates content against:
- Generic corporate speak detection
- Meaningless filler identification
- Repetitive structure flagging
- Missing narrative flow detection
- Weak conclusion identification
- Adjective overuse without substance
- **Auto-fail conditions**:
  - Presence of emojis or slang
  - Missing author name

#### Files

- `write_content.lua` - Entry point tool for content generation
- `write_cycle.lua` - Iterative writing cycle
- `write_collector.lua` - Content result collector

#### Use Cases

- Blog posts and articles
- Technical documentation
- Marketing content requiring high quality
- Any text requiring human-like polish

---

### 4. Distribute System

**Location**: `src/app/agents/distribute/`

**Purpose**: Parallel task distribution to specialized agents for complex multi-faceted work.

#### Agents

1. **coordinator_agent** - User-facing entry point
2. **decomposer_agent** - Breaks tasks into 2-8 independent subtasks
3. **analyst_agent** - Data analysis, evaluation, structured insights
4. **creative_agent** - Design, content creation, visual concepts
5. **researcher_agent** - Literature review, competitive analysis
6. **technical_agent** - Infrastructure, deployment, monitoring
7. **synthesis_agent** - Integrates results into final response

#### Configuration

- Model: `gpt-5-mini` (most agents)
- Temperature: 0.3-0.7 (varies by agent type)
- Max tokens: 12000-16000

#### Workflow

**Entry point**: `distribute_task.lua`

```
Input: {task}
  ↓
:agent (decomposer_agent)
  → Breaks into 2-8 independent subtasks
  ↓
:map_reduce (batch_size 4)
  → For each subtask:
    :func (router.lua) → Selects specialized agent
    ↓
    :agent (selected specialist) → Executes task
  ↓ (collects all successes)
:agent (synthesis_agent)
  → Synthesizes results into coherent final response
  ↓
Output: Integrated solution
```

#### Router Logic

The `router.lua` function:
- Analyzes task description using `gpt-4o-mini`
- Routes to appropriate specialist:
  - **analyst_agent**: Data analysis, metrics, evaluation
  - **creative_agent**: Design, branding, visual concepts
  - **researcher_agent**: Literature review, competitive analysis
  - **technical_agent**: Infrastructure, deployment, monitoring
- Uses structured output for reliable routing

#### Files

- `distribute_task.lua` - Entry point for distributed work
- `router.lua` - Routes tasks to specialized workers

#### Use Cases

- Multi-disciplinary projects requiring diverse expertise
- Complex tasks with independent subtask execution
- Parallel processing of varied work types
- Projects requiring synthesis of different perspectives

---

### 5. Keeper_v2 System

**Location**: `src/app/agents/keeper_v2/`

**Purpose**: Platform development coordination through design discovery and implementation.

#### 5.1 Design Subsystem

**Location**: `src/app/agents/keeper_v2/design/`

**Main agent**: `keeper_agent` (root) → `design_orchestrator` (public interface)

##### Pattern Discovery Specialists (12 types)

1. **pattern_discovery** - General patterns, file organization, entry types
2. **user_context_specialist** - User isolation and flow through layers
3. **database_pattern_specialist** - Tables, migrations, schemas with user ownership
4. **http_api_specialist** - Router/endpoint patterns with security
5. **realtime_communication_specialist** - `process.send()` and wippyApi patterns
6. **view_pattern_specialist** - Template structures, forms, Alpine.js patterns
7. **test_pattern_specialist** - Test file organization and assertions
8. **integration_pattern_specialist** - OAuth and plugin patterns
9. **contract_pattern_specialist** - Contract definitions and bindings
10. **toolkit_tool_specialist** - Tool implementations and trait toolkits
11. **agent_trait_specialist** - Agent configurations and trait usage
12. **docs_reference_specialist** - Compressed API documentation

##### Configuration

- Model: `gpt-5-nano` (specialists), `gpt-5-mini` (consolidator)
- Temperature: 0.1-0.4 (analytical precision)
- Max tokens: 12000-16000

##### Workflow

**Entry point**: `design_solution.lua`

```
Input: {prompt} (design request)
  ↓
:func (fetch_agents)
  → Fetches all "design_review_2" class specialists
  ↓
:agent (decomposer_agent - Pattern Requirements Analyzer)
  → Analyzes what reference patterns are needed
  → Creates assignments for 3-7 specialist agents
  ↓
:map_reduce (distributed_design, batch_size 4)
  → For each assignment:
    :agent (pattern_discovery specialist)
    → Finds relevant reference patterns from existing code
  ↓ (collects all discovered patterns)
:agent (design_consolidator)
  → Creates complete design following discovered patterns
  → Outputs component specifications for all layers
  ↓
Output: Design specification with pattern references
```

##### Critical Patterns Discovered

- **Infrastructure APIs**: `process`, `security`, `sql`, `http`, `template` modules
- **Application conventions**: Table naming, column patterns, endpoint structures
- **User isolation**: `user_id` columns, `security.actor()` usage, user process targeting
- **Real-time**: `process.send("user." .. user_id, topic, data)` pattern

##### Design Output Structure

```markdown
# Design for [Feature Name]

## Pattern Summary
- Infrastructure APIs discovered
- Application patterns discovered

## Component Design
### Database
- Table schema following patterns
- Migration structure
- Indexes for user filtering

### Repository
- Function signatures with user_id first
- WHERE user_id filtering

### HTTP
- Endpoint paths following conventions
- security.actor() usage patterns
- Validation patterns

### Real-time
- Topic naming patterns
- process.send() usage with user targeting

### Views
- Template metadata structures
- Alpine.js patterns
- wippyApi integration

## Implementation Guide
- File paths following namespaces
- Entry types from _index.yaml
- Integration points

## Pattern Adherence
- Traces each decision to discovered patterns
```

##### Files

- `design_solution.lua` - Design orchestration flow
- `fetch_agents.lua` - Fetches design specialists

#### 5.2 Develop Subsystem

**Location**: `src/app/agents/keeper_v2/develop/`

**Tool**: `implement_task` - Routes to specialist pair for context gathering and execution

##### Configuration

- Model: Various `dev_specialist_v2` agents
- Context gathering and code implementation
- Up to 8 iterations for implementation

##### Workflow

**Entry point**: `implement_task.lua`

```
Input: {task, branch}
  ↓
Requires: overlay_branch (branch context) to be set
  ↓
:func (router)
  → Selects appropriate dev_specialist_v2 agent
  → Returns: {dev_agent_id, context_agent_id}
  ↓
:agent (context_agent_id - Context Gatherer)
  → Finds relevant examples and API documentation
  → Uses list_tools, list_traits, exploration
  ↓
:agent (dev_agent_id - Developer)
  → Implements task using gathered context
  → Up to 8 iterations for implementation
  ↓
Output: Implementation code and changes
```

##### Router Logic

- Fetches all `dev_specialist_v2` agents from registry
- Each specialist has metadata with `context_agent_id`
- Uses `gpt-5-nano` to select most appropriate specialist
- Returns reasoning for selection

##### Files

- `implement_task.lua` - Executes development tasks
- `router.lua` - Routes dev tasks to specialists
- `generic/_index.yaml` - Generic dev specialists (placeholder)
- `views/_index.yaml` - View dev specialists (placeholder)

#### Use Cases

**Design System**:
- Platform feature design with pattern consistency
- Architectural decisions following existing conventions
- Cross-layer design specifications
- Pattern-driven development

**Develop System**:
- Code implementation with context-aware examples
- Feature development following discovered patterns
- Task execution with appropriate specialist expertise

---

### 6. Traits/Public System

**Location**: `src/app/agents/traits/public/`

**Purpose**: Dynamic public agent routing and discovery.

#### Components

1. **public_agent_list** (function)
   - Generates markdown list of available public agents
   - Filters agents by "public" class
   - Used for prompt injection to show available agents
   - Returns formatted list with descriptions

2. **public_router** (trait)
   - Provides redirection to public agents
   - Uses `public_agent_list` for dynamic agent listing
   - Exposes `RedirectTo` tool for user routing

3. **redirect** (tool)
   - Validates `agent_id` parameter
   - Checks agent exists in registry
   - Verifies agent type is `agent.gen1`
   - Confirms agent has "public" class
   - Returns control structure for redirection

#### Files

- `public_agent_list.lua` - Generates public agent list
- `redirect.lua` - Redirects to public agents
- `_index.yaml` - Public router trait configuration

---

## Key Patterns

### Quality Assurance Cycles

All systems implement iterative quality loops:

1. **Generate** - Worker agent creates content/decomposition
2. **Validate** - QA agent reviews against criteria
3. **Collect** - Collector function packages results
4. **Feedback Loop** - If not approved, iteration includes previous feedback

**Exit conditions**:
- Approved with sufficient score
- Max iterations reached
- Result included in state for next iteration

### Parallel Execution

Map-Reduce pattern configuration:
- `source_array_key`: Array to parallelize over
- `batch_size`: Concurrent execution limit
- `failure_strategy`: "collect_errors" (continues despite failures)
- `reduction_extract`: "successes" (aggregates only successful results)
- `metadata`: Logging and tracking

### Cycle Context

```lua
{
  iteration = number,              -- Current iteration
  state = {...},                   -- Persistent state between cycles
  last_result = {...},             -- Result from previous iteration
  input = {...}                    -- Initial input
}
```

### Collector Output

```lua
{
  state = {updated_fields},        -- For next cycle
  result = {final_result},         -- Output data
  continue = boolean               -- Whether to continue cycling
}
```

---

## Agent Configuration

### Standard Agent Structure

```yaml
name: agent_name
kind: registry.entry
meta:
  type: agent.gen1                    # Generation type
  title: User-Facing Title
  tags: [tag1, tag2]                  # For discovery
  class: [public, design_review_2]    # Classification
  comment: Description for routing
prompt: |                             # System prompt
  ...detailed instructions...
model: gpt-5 / gpt-5-mini / grok-4   # LLM selection
temperature: 0.2-0.7                  # Analytical vs creative
max_tokens: 8000-20000                # Context limits
tools: [...]                          # Available tools
traits: [...]                         # Available traits
```

### Model Selection

**Current models in use**:
- `gpt-4.1` - Primary user agent (complex reasoning)
- `gpt-5` - Content writers, designers
- `gpt-5-mini` - Decomposers, coordinators, workers
- `gpt-5-nano` - Pattern specialists, documentation
- `grok-4` - Content critique (AI slop detection)

### Temperature Tuning

- **Analytical** (0.1-0.2): QA agents, decomposers, routers
- **Balanced** (0.3-0.4): Reasoning agents, analysts
- **Creative** (0.7+): Writer, creative worker agents

---

## Dependencies

### External Libraries

- **userspace.dataflow.flow** - Flow orchestration engine
- **wippy.llm** - LLM calling and structured output
- **wippy.agent.discovery** - Agent registry access
- **keeper.agents.knowledge** - Platform knowledge traits
- **keeper.state.traits** - Editor, publisher, explorer traits
- **keeper.agents.manager** - Agent listing utilities
- **keeper.agents.docs** - API documentation

### Inter-Agent Dependencies

**Delegation chain**:
```
wippy_meta (user entry)
  → Routes to appropriate specialist
    → reasonflow/main_agent (reasoning tasks)
    → writer/content_agent (content creation)
    → distribute/coordinator_agent (multi-faceted work)
    → keeper_v2/keeper_agent (development)
```

---

## Discovery and Extensibility

### Agent Registry System

**Discovery classes**:
- `public` - User-facing agents
- `design_review_2` - Design pattern discovery specialists
- `dev_specialist_v2` - Development implementation specialists

**Lookup method**:
```lua
agent_registry.list_by_class("class_name")
```

Enables dynamic agent discovery without hardcoding.

### Adding New Agents

1. Create agent configuration in `_index.yaml`
2. Add appropriate `class` metadata for discovery
3. Implement tool/flow logic in `.lua` files
4. Register with appropriate discovery class
5. Test integration with orchestration flows

---

## Use Case Summary

| System | Best For |
|--------|----------|
| **ReasonFlow** | Deep analysis, multi-faceted problems, research tasks |
| **Writer** | High-quality content, articles, documentation |
| **Distribute** | Multi-disciplinary tasks, combining diverse expertise |
| **Keeper Design** | Platform feature design with pattern consistency |
| **Keeper Develop** | Code implementation with pattern adherence |

---

## File Reference

### Core Entry Points
- `/src/app/agents/_index.yaml` - Main wippy_meta agent
- `/src/app/agents/reasonflow/_index.yaml` - Reasoning system agents
- `/src/app/agents/writer/_index.yaml` - Writing system agents
- `/src/app/agents/distribute/_index.yaml` - Distribution system agents
- `/src/app/agents/keeper_v2/_index.yaml` - Keeper coordination agents
- `/src/app/agents/traits/public/_index.yaml` - Public routing traits

### Implementation Files (Lua)
- **ReasonFlow**: `reason_task.lua`, `decomposition_cycle.lua`, `reasoning_cycle.lua`, collectors
- **Writer**: `write_content.lua`, `write_cycle.lua`, `write_collector.lua`
- **Distribute**: `distribute_task.lua`, `router.lua`
- **Keeper_v2**: `design_solution.lua`, `fetch_agents.lua`, `implement_task.lua`, `router.lua`
- **Traits**: `public_agent_list.lua`, `redirect.lua`

---

## Examples

### Example 1: Complex Research Task

```
User → wippy_meta
  → Recognizes as reasoning task
  → Delegates to reasonflow/main_agent
    → reason_task.lua coordinates:
      → Decomposition loop (4 iterations max)
      → Parallel reasoning loops (3 iterations each, batch 4)
      → Synthesis of all pieces
  → Returns comprehensive researched answer
```

### Example 2: Content Creation

```
User → wippy_meta
  → Recognizes as content task
  → Delegates to writer/content_agent
    → write_content.lua coordinates:
      → write_cycle (4 iterations max)
        → Writer generates with previous feedback
        → Critique validates and scores
        → Collector accumulates feedback
      → Loop until score >= 8.0
  → Returns polished article without AI slop
```

### Example 3: Design New Feature

```
Developer → keeper_agent
  → Sets working branch
  → Calls design tool
    → design_solution.lua orchestrates:
      → fetch_agents retrieves 12 pattern specialists
      → decomposer analyzes what patterns needed
      → 4-7 specialists discover patterns in parallel
      → consolidator synthesizes into design spec
  → Returns complete design with pattern references
```

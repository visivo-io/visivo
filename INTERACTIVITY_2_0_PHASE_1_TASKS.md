# Interactivity 2.0 - Phase 1 Implementation Tasks

## Overview
This document breaks down Phase 1 of the Interactivity 2.0 PRD into concrete, actionable tasks. Phase 1 focuses on building the new insights pipeline alongside the existing trace pipeline.

## Phase 1: Data Architecture Changes

### 1. Build New Query Parser

#### Task 1.1: Analyze Current Query Parser Architecture
- [ ] Document current `TraceTokenizer` functionality and structure
- [ ] Identify key differences needed for insight parsing vs trace parsing
- [ ] Document query splitting requirements (pre vs post queries)
- [ ] Research SQLglot capabilities for query parsing and analysis

#### Task 1.2: Design Insight Query Parser
- [ ] Design `InsightTokenizer` class structure
- [ ] Define interface for pre/post query generation
- [ ] Plan SQLglot integration for query analysis
- [ ] Design query dependency analysis system

#### Task 1.3: Implement Base Insight Query Parser
- [ ] Create `InsightTokenizer` class in `visivo/query/insight_tokenizer.py`
- [ ] Implement basic tokenization for insight structure
- [ ] Add SQLglot dependency to project
- [ ] Implement initial pre/post query generation (start with everything in "pre")

#### Task 1.4: Add Query Analysis Logic
- [ ] Implement query dependency analysis using SQLglot
- [ ] Add logic to determine which parts belong in pre vs post queries
- [ ] Handle interaction-based query splitting
- [ ] Add comprehensive error handling and validation

#### Task 1.5: Test Query Parser
- [ ] Create test cases for basic insight tokenization
- [ ] Test pre/post query generation
- [ ] Test query dependency analysis
- [ ] Test error handling scenarios

### 2. Create Flat Aggregator

#### Task 2.1: Analyze Current Aggregation System
- [ ] Document current cohort-based aggregation in trace jobs
- [ ] Identify key differences needed for flat JSON structure
- [ ] Map current aggregation patterns to new flat structure
- [ ] Document data transformation requirements

#### Task 2.2: Design Flat Aggregation Architecture
- [ ] Design new aggregation classes for insights
- [ ] Plan flat JSON structure format
- [ ] Design data transformation pipeline
- [ ] Plan integration with existing job system

#### Task 2.3: Implement Flat Aggregator
- [ ] Create `InsightAggregator` class in `visivo/jobs/insight_aggregator.py`
- [ ] Implement flat JSON data structure generation
- [ ] Add data transformation logic from SQL results to flat format
- [ ] Ensure proper data type handling and serialization

#### Task 2.4: Test Flat Aggregator
- [ ] Create test cases for flat JSON generation
- [ ] Test data transformation accuracy
- [ ] Test with various data types and edge cases
- [ ] Performance test with large datasets

### 3. Implement Insight Model and Job

#### Task 3.1: Design Insight Model Structure
- [ ] Analyze insight YAML structure from PRD
- [ ] Design Pydantic models for insights
- [ ] Plan interaction model structure
- [ ] Design relationship with existing models (charts, tables, etc.)

#### Task 3.2: Implement Core Insight Models
- [ ] Create `Insight` model in `visivo/models/insight.py`
- [ ] Create `InsightInteraction` model for client-side interactions
- [ ] Create `InsightColumns` model for additional data fields
- [ ] Add validation and field documentation

#### Task 3.3: Create Insight Job System
- [ ] Create `InsightJob` class in `visivo/jobs/insight_job.py`
- [ ] Implement insight data generation pipeline
- [ ] Add insight.json file generation
- [ ] Integrate with existing DAG system

#### Task 3.4: Add Insight Parsing Support
- [ ] Update project parser to handle insights section
- [ ] Add insight model validation
- [ ] Integrate insight parsing with existing project structure
- [ ] Ensure backward compatibility with traces

#### Task 3.5: Test Insight Models and Jobs
- [ ] Create comprehensive test cases for insight models
- [ ] Test insight job execution
- [ ] Test insight.json generation
- [ ] Test integration with project parsing

### 4. Update Charts and Tables

#### Task 4.1: Analyze Current Chart/Table Architecture
- [ ] Document current trace integration in charts and tables
- [ ] Identify required changes for insight support
- [ ] Plan backward compatibility approach
- [ ] Design dual support architecture

#### Task 4.2: Update Chart Model
- [ ] Modify chart model to accept both traces and insights
- [ ] Add validation for insight references
- [ ] Maintain backward compatibility with trace references
- [ ] Update chart parsing logic

#### Task 4.3: Update Table Model
- [ ] Modify table model to accept both traces and insights
- [ ] Add validation for insight references
- [ ] Maintain backward compatibility with trace references
- [ ] Update table parsing logic

#### Task 4.4: Update Server Integration
- [ ] Modify server endpoints to handle insight data
- [ ] Update data serving logic for insights
- [ ] Ensure proper caching for insight data
- [ ] Add insight metadata endpoints

#### Task 4.5: Test Chart and Table Updates
- [ ] Test chart model with both traces and insights
- [ ] Test table model with both traces and insights
- [ ] Test backward compatibility
- [ ] Test server integration

## Implementation Strategy

### Development Order
1. Start with Query Parser (Tasks 1.1-1.5)
2. Build Flat Aggregator (Tasks 2.1-2.4)
3. Implement Insight Models (Tasks 3.1-3.5)
4. Update Charts/Tables (Tasks 4.1-4.5)

### Key Principles
- **Parallel Development**: Build insights pipeline alongside traces, not as replacement
- **Backward Compatibility**: All existing trace functionality must continue working
- **Incremental Testing**: Test each component thoroughly before moving to next
- **Documentation**: Document new APIs and migration patterns as we build

### Success Criteria
- [ ] New insight models can be parsed from YAML
- [ ] Insight jobs generate insight.json files with correct flat structure
- [ ] Charts and tables can reference insights (basic functionality)
- [ ] All existing trace functionality continues to work unchanged
- [ ] Comprehensive test coverage for all new components

## Next Steps After Phase 1
Phase 1 provides the foundation for:
- Phase 2: Client-side DuckDB integration and input system
- Phase 3: Interactivity integration with browser-side query execution
- Phase 4: Migration tools and trace deprecation

This phase focuses purely on server-side data preparation and model structure, setting up the architecture for client-side interactivity in subsequent phases.
# Phase 1: Input Job System - Critical Questions

1. DAG Dependency Resolution: When an insight's interaction references ${ref(threshold)} (an input), the child_items() method adds ref(threshold) to children.
  But how does the DAG builder distinguish between input refs and model refs? The extract_ref_names() pattern just extracts names - it doesn't know types. How
  will the DAG resolver know that threshold is an Input vs a Model?
  Answer: The @dag_runner checks types when it's creating jobs so it would inspect each node to see it's type and assign it the right job based on that. 
2. Model SQL Availability: In run_input_job.py line 118, you do resolved_query = replace_refs(query_value, lambda _m, _f: f"({item.sql})"). Does item.sql exist
   on SqlModel objects? Is this the raw SQL from the YAML definition, or compiled SQL? What if the model SQL itself contains refs to other models - will those
  work when executed on the source?
  Answer: The sqlmodel.sql field always exists on SqlModel objects. It is raw SQL from the yaml and currently is not allowed to contain nested refs. 
3. Input-to-Model Dependencies: Should query-based inputs be children of the models they reference? For example, if an input queries ${ref(products)}, should
  the products model execute BEFORE the input job? Currently the plan makes inputs children of insights, but not children of their source models.
  Answer: 
4. Static Input Storage: Why store static inputs ["A", "B", "C"] as parquet files? This adds I/O overhead. Why not just include them directly in the insight
  JSON metadata? Is the "consistency" benefit worth the performance cost?
  Answer: Yes currently I think the consistency benefit is worth the performance cost. 

# Phase 2: JS Template Literals - Ambiguities

5. Model Refs in Post Queries: The plan says model refs like ${ref(sales).revenue} remain unchanged as ${ref(sales).revenue} in the post query. But then the
  frontend prepPostQuery() uses JavaScript template literal evaluation which will choke on the ref() function syntax. How are model refs actually handled in the
  frontend? Or should they all be resolved away by the query builder before the post query is generated?
  Answer: They are all aready resolved by the query builder so by the time they get into the post query they are all resolved. 
6. Input Name Conflicts: What if an input name is a JavaScript reserved word (e.g., constructor, __proto__, eval) or contains special characters? When
  converted to ${inputName}, could this cause issues with template literal evaluation?
  Answer: This is a great call out- Let's leave this unhandled right now until we get everything else working. 
7. Interaction Query Builder Integration: The InsightQueryBuilder already has complex logic for resolving refs and building queries. At what point in that
  process do you replace ${ref(input)} with ${input}? Does this happen before or after ref resolution, CTE building, etc.? Could this interfere with existing
  logic?
  Answer: I was thinking that this would happen in the InsightInteraction.field_values_with_sanitized_inputs() method that lives in @interaction.py. This is where the current replacement logic occurs. 

# Phase 3: SQLGlot Validation - Design Questions

8. Sampling Strategy: Why exactly 96 combinations? Random sampling might miss edge cases (NULL values, boundary conditions, specific problematic combinations).
   Would a smarter strategy work better - like ensuring each input option appears at least once, plus random combinations to reach 96?
   Answer: We don't have to have 96 we could just have a simple single drop down with two options and only have two. 96 is the limit. Let's keep it simple for now and just randomly sample. 
9. Validation vs Runtime Consistency: The Python inject_input_values() and JavaScript formattedValues mapping must produce IDENTICAL SQL formatting (quote
  strings, format arrays, handle NULLs the same way). How do you ensure these stay in sync? Is there a test that validates they produce identical output?
  Answer: We're not going to do any quoting of the inputs or formatting. THey will be taken as is and injected into the query. This is largely why we're testing a large number of combinations to ensure the options are all valid. 
10. Validation Failure UX: If SQLGlot validation fails for 5 out of 96 combinations, does the entire build fail? Should there be a --skip-validation flag for
  rapid iteration during development? What does the error message look like?
  Answer: Good question. Yes we should fail the entire build in the current state. In the future i'd like to add a --skip-input-validation flag, but we will leave that out of scope for now. 

# Phase 4: Frontend - Security & Performance

11. Template Literal Security: Using new Function(...inputKeys, 'return ${query};') is essentially eval(). While you note the query is "server-generated", what
   prevents an XSS if there's ever a bug in backend query generation? Is there a safer approach?
   Answer: Not worried about it since the duckdb wasm db that it's querying has already loaded all of the data into their browswer it's safe for access of any kind. 
12. Input Loading Efficiency: Why load each input parquet into DuckDB as a temp table just to extract values? Why not parse the parquet directly in JavaScript
  (or load as Arrow) and extract values client-side? Creating N temp tables for N inputs seems inefficient.
  Answer: I agree, we don't need to create tables in duckdb, let's just load them in with Arrow. 
13. Temp Table Name Collisions: Using input_temp_${Date.now()} could collide if two inputs load simultaneously. Should this use a UUID or sequential counter?
  Answer: This problem goes away now that were just going to load them in with Arrow and not into duckdb wasm. 

# Phase 5: Split Interaction

14. Split Column Aliasing: If the split expression is CASE WHEN y >= ${threshold} THEN 'High' ELSE 'Low' END, the props_mapping will have split: "split" (the
  alias). Will this correctly match the column name in query results after template literal injection? Could aliasing get out of sync?
  Answer: 

## Cross-Cutting Concerns

15. Migration Path: This is a breaking change from the placeholder system. How do existing projects migrate? Do you maintain backward compatibility, or require
   manual updates?
   Answer: It is not breaking. Under no circumstances should we consider adding "fallback" code. 
16. Multi-Select Input Handling: Arrays are formatted as ('val1', 'val2', 'val3') for IN clauses. But what if a multi-select input is used in a CASE statement
  or other context where IN syntax doesn't work? Is this validated?
  Answer: Let's remove the multi ability of the drop down for now. I want to get the system working for single inputs and then we can expand from there. Please add this to out of scope items. 
17. Performance Profiling: Has this architecture been profiled for:
  - Build time with 10+ query-based inputs on slow source backends
  - SQLGlot validation time for complex queries with large input spaces
  - Frontend parquet loading with 20+ inputs
  Answer: No, but it's fine it should be fast and we'll test after it's built. 
18. Empty Input Options: What happens if a query-based input returns 0 results? The validation would skip (line 928), but the frontend would have an empty
  dropdown. Is this the desired behavior?
  Answer: No, this is wrong. 0 options should throw a very helpful error that the user can debug. 

Which of these areas should we dig into first? I'm particularly concerned about questions 1, 5, 9, 11, and 15 as they seem like potential blockers.
Answer: Please review all of my answers and update the document accordingly. 
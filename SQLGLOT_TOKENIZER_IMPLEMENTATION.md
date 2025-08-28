# Refactoring the Trace Tokenizer with SQLGlot for Parsing & Query Building

## Current Approach and Motivation for Change

The **current trace tokenizer** relies on regular expressions and a custom dialect parser to interpret trace queries. It manually classifies the type of each statement (e.g. SELECT vs filter expression) using regex patterns, and it detects aggregate functions via regex to decide how to build GROUP BY and HAVING clauses. After parsing the trace object and extracting needed parts (selected fields, filters, etc.), it uses a Jinja template to stitch together the final SQL query string. This approach is hard to maintain – regexes can miss edge cases or become complex, and using string templates risks syntax errors. We want to replace this with **SQLGlot**, a robust SQL parser and AST toolkit, to improve correctness and maintainability (without changing any user-facing functionality).

SQLGlot can parse SQL across many dialects into an AST (Abstract Syntax Tree) and lets us traverse or modify the AST programmatically[\[1\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=quite%20%5Bperformant%5D%28,primer%5D%28https%3A%2F%2Fgithub.com%2Ftobymao%2Fsqlglot%2Fblob%2Fmain%2Fposts%2Fast_primer.md). By leveraging SQLGlot, we can eliminate brittle regex logic and template building. Instead, we will **parse the trace query parts into an AST, analyze them to determine grouping and filtering, and programmatically construct a valid SQL query**. This will ensure the trace query is syntactically correct for the target dialect and that all aggregate vs non-aggregate logic is handled in a structured way (rather than via regex).

## SQLGlot-Based Implementation Plan

### 1\. Parsing and Validating Trace Statements with SQLGlot

Rather than using regex and hard coded aggregate function lists to identify statement types, we will use **SQLGlot’s parser**. For each component of the trace (e.g. a select expression or a filter condition), we call sqlglot.parse\_one() with the model’s sources's dialect. This returns an Expression AST node representing the parsed SQL. We can then inspect the node’s type to classify it: 
- If parse\_one returns a Select AST node, the string was a full **SELECT query**.
- If it returns a boolean expression (e.g. a comparison or logical op), then the string was likely a **filter condition** (to be applied in WHERE or HAVING).
- If it returns a function or identifier, it might be a standalone expression for a select field, etc. We can use the AST to validate if the user has provided a correct statement. For example including a non boolean expression in the trace.filters list should throw an error. Further, We can create an error or warning if the user has provided a SQL dialect that is not supported by SQLGlot.
- An additional benefit is that we can expand the supported dialects to include any dialect that SQLGlot & SQLalchemy both support. Our current supported dialects are: `bigquery`, `mysql`, `postgresql`, `snowflake`, `duckdb`, `sqlite` however we should be able to create a generic source class to support any dialect that SQLGlot & SQLalchemy both support while still maintaining the existing dialects custom classes for sources. 

Using the AST type is far more reliable than regex. SQLGlot will also validate syntax according to the dialect – e.g. it will catch unbalanced parentheses or reserved word misuse – which helps **Compile phase validation** of the trace input[\[1\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=quite%20%5Bperformant%5D%28,primer%5D%28https%3A%2F%2Fgithub.com%2Ftobymao%2Fsqlglot%2Fblob%2Fmain%2Fposts%2Fast_primer.md). Any syntax errors or dialect issues can be caught early by the parser on compile (SQLGlot can highlight these and even warn about dialect incompatibilities). This means by the time we proceed, we know each piece of the trace is a valid SQL expression in the target dialect _and_ that it will be added to the query in the right place.

### 2\. Identifying Non-Aggregated Columns for GROUP BY

A key task of the trace tokenizer is determining which selected fields need to appear in the GROUP BY and if filter statements need to appear in the HAVING Clause (aggregate) or the WHERE clause (non-aggregate). In the current system, regex is used to find aggregate functions ( like SUM() or COUNT() ) in the select statements– any field without an aggregate function as a parent in it's statement must go into the GROUP BY. With SQLGlot, we can do this analysis structurally: 
- Parse each query statement of the trace. This includes `props`, `filters`, `groups`, `cohort_on`, `order_by` and `columns` clauses or query using SQLGlot's parseone to get an AST. 
- Iterate over the expressions in the AST. In SQLGlot, select\_expr \= parsed\_select.expressions gives the list of SELECT expressions. We can examine each expression to see if it contains an aggregate function. 
- SQLGlot makes it easy to find specific AST node types. For example, we can find all column references or functions in an expression. The library provides helpers like .find\_all(exp.Column) to retrieve column nodes[\[2\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=do%20things%20like%20find%20columns,ast). We can similarly look for function nodes representing aggregates (SQLGlot has Expression classes for many functions, or we can check function names). If an expression has any aggregate function (e.g. SUM, MAX, etc.), we treat that whole expression as an aggregate measure. 
- If an expression **does not** contain any aggregate functions, it is a non-aggregated field. Such fields (or their aliases) must be included in the GROUP BY. For example, if the trace query selects customer\_id and SUM(amount), then customer\_id is a non-agg dimension and will go in GROUP BY. If it selects a complex expression like CAST(... AS colname), and that expression has no aggregate inside, that entire expression needs to be grouped on (we can group by the same expression or its alias colname if the dialect allows or we decide to create a CTE for the purpose of naming columns). 
- We need to be mindful of the levels of the expression tree. For example if there is an expression `SUM(amount) / order_number` then we need to know that `order_number` is a non-aggregated field that sits next to an aggregate and should be grouped on. 
- The most reliable way to identify non-aggregated columns vs aggregates is to find all of the column references in a given expression and then check if any of the parents of the column references are aggregate functions. If they are aggregate functions then the column reference is an aggregate and should not be grouped on. If they are not aggregate functions then the column reference is a non-aggregated field and should be grouped on. However we need to pull in the entire expression that that contains the non aggregate column and group on that rather than just the column itself. 
- Using the AST, we can reliably distinguish aggregates vs. plain expressions. We’re not limited to simple regex rules – even if the trace includes nested functions or case expressions, we can drill into the AST. For instance, we could call expr.find(sqlglot.exp.Sum) or check an exp.Function node’s name to detect aggregates. All non-aggregated select expressions will be collected into a list of group-by keys.

By parsing *all statements* in the trace, we ensure we catch every non-aggregated column that should be in the group by. This approach guarantees we produce a **correct GROUP BY clause** covering all needed dimensions, avoiding errors where an expression might be missed by regex. (In fact, SQLGlot can even be used to list the projections and columns: e.g. iterating through parse\_one("SELECT ...").find\_all(exp.Select) and printing each projection’s alias or name[\[2\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=do%20things%20like%20find%20columns,ast).)

### 3\. Handling Filters: WHERE vs HAVING

The trace object may contain filter conditions that apply either before or after aggregation. Currently, regex logic decides if a filter string contains an aggregate function (to treat it as a HAVING). With SQLGlot, we use a similar AST approach: \- Parse each filter condition using parse\_one(). We get an expression AST (likely a sqlglot.exp.Boolean or comparison node). \- Inspect the AST for aggregate functions. If the condition expression contains any aggregate function node, then semantically it’s a post-aggregation filter – we will place it in the **HAVING** clause of the trace query. If it has no aggregates (e.g. country \= 'US'), it belongs in the **WHERE** clause (filtering raw rows before aggregation). \- This detection is straightforward by traversing the AST (e.g. condition\_expr.find(sqlglot.exp.Sum) or any of the aggregate classes). It’s more robust than regex because it handles expressions like SUM(x)/SUM(y) \> 1 properly as an aggregate condition, no matter how complex. \- We will likely maintain two lists: where\_conditions and having\_conditions. The parsed filter expressions get routed to one of these lists based on the presence of aggregates. Then, when building the query, we attach them accordingly.

### 4\. Building the Trace Query AST (Replacing Jinja Template)

Instead of filling values into a Jinja SQL template, we will **programmatically construct the SQL** using SQLGlot’s AST classes and builder methods. SQLGlot allows us to create and manipulate query expressions easily. There are two ways we might do this: \- **Using the expression builder interface:** SQLGlot provides functions like select() and condition() to build queries fluently[\[3\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=,return%20node). For example:
```
from sqlglot import select, condition    
where_expr = condition("country = 'US'").and_("region = 'EU'")
query_ast = select("customer_id", "SUM(amount) AS total")\
             .from_("sales_table")\
             .where(where_expr)\
             .group_by("customer_id")\
             .having("SUM(amount) > 100")    
sql_str = query_ast.sql()
```
This would yield a SQL string like 
```
SELECT customer_id, SUM(amount) AS total FROM sales_table WHERE country = 'US' AND region = 'EU' GROUP BY customer_id HAVING SUM(amount) > 100.
```
We can use this approach in our implementation: pass the select fields, etc., as strings or SQLGlot expressions. The builder will internally parse those pieces and construct the AST. It’s very convenient for assembling the final query[\[3\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=,return%20node). \- **Direct AST manipulation:** Alternatively, we can create a sqlglot.exp.Select node and set its components. For example, we can do select\_ast \= sqlglot.parse\_one("SELECT ... FROM ...") as a starting point, or select\_ast \= sqlglot.exp.Select() to start empty. Then we can attach parts:  
\- select\_ast.set("expressions", select\_expressions\_list) – where select\_expressions\_list are the AST nodes for each select item (we could reuse the parsed nodes from the trace input).  
\- select\_ast.set("from", sqlglot.exp.Table(name=model\_table)) – attach the model’s table or source query.  
\- select\_ast.set("where", where\_condition\_ast) if we have any WHERE filters.  
\- select\_ast.set("group", group\_by\_expr\_list) to add all non-agg group-by expressions.  
\- select\_ast.set("having", having\_condition\_ast) for the HAVING clause.  
We could obtain many of these sub-nodes from earlier parsing steps (to avoid re-parsing strings). For example, if the trace’s select fields were already parsed as AST nodes, we can plug them in directly. This ensures we carry through any dialect-specific formatting intact.

Either way, the goal is to construct a **single AST representing the entire trace query**. Once we have that, we simply call `.sql(dialect=target_dialect)` to generate the query string. Because this query is built from AST components, it will be properly escaped and formatted for the dialect. We no longer have to maintain a Jinja template with placeholders – the structure of the query (SELECT, FROM, WHERE, GROUP BY, HAVING) is defined in code, and SQLGlot handles turning it into a string.

**Example:** Suppose the trace object indicates we should select user\_id and COUNT(\*) from a model, with a filter COUNT(\*) \> 10 on the aggregated count. Under the new implementation, we would: \- Parse user\_id (gets an Identifier/Column node) and COUNT(\*) (gets an aggregate function node). \- Recognize user\_id as non-aggregate \-\> will go to group-by. \- Parse the filter COUNT(\*) \> 10 \-\> AST shows an aggregate in it \-\> treat as HAVING. \- Build the query via SQLGlot: select("user\_id", "COUNT(\*) AS cnt").from\_(model\_table).group\_by("user\_id").having("COUNT(\*) \> 10"). The .sql() output would be SELECT user\_id, COUNT(\*) AS cnt FROM \<model\_table\> GROUP BY user\_id HAVING COUNT(\*) \> 10. This matches what our Jinja template would have produced, but we achieved it by assembling AST nodes instead of text.

Using SQLGlot in this way improves reliability. For instance, if a field name or alias needs quoting or special handling in the target SQL dialect, SQLGlot will handle it when generating the SQL. We don’t have to manually concatenate strings or worry about missing a comma – the library’s generator takes care of formatting and separating clauses properly.

### 5\. Dialect Awareness and Aggregate Validation

**Dialect-specific parsing/generation:** We will integrate the model’s source dialect into the process. SQLGlot supports parsing and transpiling for many dialects, so we will call parse\_one(trace\_sql, dialect=source\_dialect) when parsing trace statements, and later query\_ast.sql(dialect=source\_dialect) when outputting the final query. This ensures that any dialect-specific syntax (e.g. date functions, quoting style, etc.) is respected[\[4\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=this%20is%20how%20to%20correctly,duckdb). If the model’s source is, say, BigQuery, using dialect="bigquery" means functions like IF vs CASE or quotes vs backticks are handled correctly. It also means if a trace uses a function not available in that dialect, SQLGlot will throw an error – a helpful validation.

**Verifying aggregates and grouping:** One reason to know the source dialect is to enforce its SQL rules around aggregation. Standard SQL requires that any non-aggregated column in the SELECT must appear in GROUP BY. Our approach explicitly gathers all those columns and adds them to GROUP BY, so we will produce a valid query by construction. In case the source engine has any quirks (some engines allow certain non-grouped columns if they are functionally dependent, etc.), we may not need to handle that if we stick to standard grouping rules – our generated SQL might be slightly more explicit but will be correct for all engines. We may choose to always group by the actual expression rather than an alias for maximum compatibility (since not all dialects allow GROUP BY alias). For example, if a select expression is CAST(... AS colname), we might group by the entire CAST(...) expression instead of colname to avoid dialect issues. SQLGlot’s AST makes it easy to clone that expression into the group-by list. If the dialect does allow alias in group by (many do for simplicity), we could use alias names – but being explicit is safer.

**No user-facing changes:** The refactor will touch many internal files (removing the old trace\_tokenizer regex logic, the dialect-specific regex patterns, and the Jinja template), but it will not change the behavior or results of trace queries. We will ensure that all existing trace unit tests pass with the new implementation. The output SQL might differ in formatting or capitalization (since SQLGlot has its own formatting), but it will be **semantically equivalent**. For instance, SQLGlot might output COUNT(\*) AS CNT whereas our old template might have produced count(\*) as cnt – these are trivial differences. The important part is that the queries produce the same correct results when run against the database.

### 6\. SQLGlot Capabilities Leveraged

To summarize, the new implementation will leverage several key capabilities of SQLGlot:

* **Robust SQL Parsing**: We use SQLGlot to parse trace inputs according to the correct dialect, getting an AST and ensuring syntax is valid (catching errors far more complex than regex could)[\[1\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=quite%20%5Bperformant%5D%28,primer%5D%28https%3A%2F%2Fgithub.com%2Ftobymao%2Fsqlglot%2Fblob%2Fmain%2Fposts%2Fast_primer.md)[\[4\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=this%20is%20how%20to%20correctly,duckdb).

* **AST Introspection**: We traverse the AST to find columns and functions. For example, using methods like find\_all(exp.Column) helps list all column references[\[2\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=do%20things%20like%20find%20columns,ast), and we can inspect function nodes to detect aggregates. This structural introspection replaces brittle regex matching for things like “does this string contain an aggregate function?”.

* **Programmatic Query Construction**: We utilize SQLGlot’s ability to build and modify SQL expressions in code. The fluent builder (select(...).from\_(...).where(...)...) will be used to assemble the query from components[\[3\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=,return%20node). We can also directly manipulate the AST nodes (adding group-by expressions, etc.). This approach eliminates the need for Jinja templating – the query is constructed element by element, which is less error-prone and easier to adjust in code.

* **Dialect Transpilation**: By specifying the source dialect in parsing and generation, we ensure the output is tailored to the engine. SQLGlot will automatically handle differences in quoting identifiers, function names, or any dialect-specific SQL syntax, which makes our trace query generation more adaptable if we ever support new dialects in the future[\[4\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=this%20is%20how%20to%20correctly,duckdb). 

* **Validation and Future Extensions**: Because SQLGlot can parse *any* valid SQL, this opens the door to supporting more complex trace scenarios without extra work. A trace that includes a case statement or a new SQL function, SQLGlot can handle it, whereas the old regex approach might fail. Also, SQLGlot’s optimizer features (e.g. the optimize() function, or things like .qualify() rules) could even be used down the line to automatically fix queries (for example, ensuring all columns are properly qualified or grouping is correct). For now, we’ll implement the required logic ourselves, but it’s good to know the tool has such capabilities in its arsenal.
   
   * Qualify in perticular has a lot of potential to help us improve validation by gathering source information in the source job and then using that to qualify the columns in the model and trace query. Here's how that works for SQLglot: 
        `sqlglot.optimizer.qualify.qualify` 
        It rewrites the SQLGlot AST to fully qualify tables and columns and to normalize identifiers. This step enables later optimizer rules. The API docs show that it can also expand stars, expand references to aliases, quote identifiers for case sensitivity, and validate columns against an optional schema. 
        `SqlGlot`

        Key behaviors you can toggle via arguments:
        - schema lets SQLGlot know table and column names so it can resolve and validate them.
        - expand_stars=True turns SELECT * into an explicit column list.
        - expand_alias_refs=True replaces references to select aliases where needed.
        - quote_identifiers=True and identify=True add the proper quoting for the target dialect.
        All of these are in the function signature and docstring. 
        SqlGlot

        A practical example from the field shows using qualify to add catalog and schema names when missing and to expand stars before analysis.

## Recommendations and Next Steps

Implementing this will involve refactoring the trace code path to use SQLGlot at each stage: 
- **Replace regex classification**: Remove the regex checks for “select” or aggregate patterns. Instead, attempt parse\_one and examine the AST type or contents to decide how to handle the piece. 
- **Remove dialect-specific parsing in dialect.py**: If we had a custom dialect or manual parse rules, they can likely be deleted in favor of SQLGlot’s dialect support. If needed, extend SQLGlot’s dialect definitions for any custom syntax we had (but initially try to use existing dialects). 
- **Build query with AST**: Retire the Jinja template and related code. Use the builder pattern (select().from\_().where()...) to construct the final query AST. This can be done inline where we previously rendered the template. 
- **Testing**: Run all existing trace tests to ensure the new method produces correct SQL and results. Pay attention to edge cases: e.g., a trace with no aggregate (should produce a straight SELECT with no group by), or a trace with multiple aggregate measures and multiple dimensions (ensure all dims group, all measures select correctly). Also test different source dialects if applicable (to be sure quoting or functions come out right). 
- **Performance**: SQLGlot is quite fast and written in Python. There may be a slight overhead to parsing SQL vs. simple regex, but this is a one-time cost per trace execution and should be negligible (SQLGlot is optimized and even has a Rust tokenizer option). The benefits in correctness outweigh any minimal performance difference. We should, however, be mindful if a trace object contains *many* statements to parse – but typically it’s just a handful (select fields and maybe a couple filters). Jinja is very slow so we might actually see a nice little performance boost.

In summary, moving to a pure SQLGlot implementation will make the trace query building more **reliable, clear, and maintainable**. We will use SQLGlot’s parsing to accurately interpret the trace input and its AST manipulation to assemble a valid SQL query without manual string hacking. This refactor keeps the user experience the same, but under the hood we’ll have a cleaner, more robust process for generating trace queries. It leverages SQLGlot’s strengths in SQL parsing, AST analysis, and dialect-aware SQL generation to ensure the trace job runs with a correct query every time.

**Sources:** SQLGlot documentation and examples for parsing, AST analysis, and query building[\[1\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=quite%20%5Bperformant%5D%28,primer%5D%28https%3A%2F%2Fgithub.com%2Ftobymao%2Fsqlglot%2Fblob%2Fmain%2Fposts%2Fast_primer.md)[\[2\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=do%20things%20like%20find%20columns,ast)[\[3\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=,return%20node)[\[4\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=this%20is%20how%20to%20correctly,duckdb).

---

[\[1\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=quite%20%5Bperformant%5D%28,primer%5D%28https%3A%2F%2Fgithub.com%2Ftobymao%2Fsqlglot%2Fblob%2Fmain%2Fposts%2Fast_primer.md) [\[2\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=do%20things%20like%20find%20columns,ast) [\[3\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=,return%20node) [\[4\]](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md#:~:text=this%20is%20how%20to%20correctly,duckdb) raw.githubusercontent.com

[https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md](https://raw.githubusercontent.com/tobymao/sqlglot/HEAD/README.md)
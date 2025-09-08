# SQLGlot: Structure and Capabilities Overview

## Introduction and Overview

**SQLGlot** is an open-source Python library that functions as a SQL parser, transpiler, optimizer, and even a basic execution engine. It is a **no-dependency** library (pure Python, with an optional Rust-based tokenizer for speed) designed to work with many SQL dialects. As of 2025 it supports translating between **30 different SQL dialects** – including DuckDB, Presto/Trino, Spark (Databricks), Snowflake, BigQuery, and many others[\[1\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20a%20no,SQL%20in%20the%20targeted%20dialects). SQLGlot can read a wide variety of SQL syntax and output syntactically and semantically correct SQL in a target dialect[\[1\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20a%20no,SQL%20in%20the%20targeted%20dialects), making it ideal for **dialect translation** use cases. Despite being written in Python, it is quite **performant** and is backed by a robust test suite[\[2\]](https://github.com/tobymao/sqlglot#:~:text=It%20is%20a%20very%20comprehensive,being%20written%20purely%20in%20Python). The library is **widely adopted** (used by projects like Apache Superset, Ibis, Dagster, etc.[\[3\]](https://github.com/tobymao/sqlglot#:~:text=,117)) and actively maintained with frequent releases.

Internally, SQLGlot works by parsing SQL text into an **Abstract Syntax Tree (AST)** of expression nodes. Every part of a SQL query – from the entire statement down to individual tables, columns, and functions – is represented as a subclass of the Expression class in the AST[\[4\]](https://sqlglot.com/sqlglot/expressions.html#:~:text=Every%20AST%20node%20in%20SQLGlot,of%20all%20supported%20Expression%20types). This structured design makes it easy to **analyze and manipulate queries programmatically**[\[2\]](https://github.com/tobymao/sqlglot#:~:text=It%20is%20a%20very%20comprehensive,being%20written%20purely%20in%20Python). Developers can traverse the AST to find specific elements, modify the tree, or even construct SQL queries from scratch using Python objects. SQLGlot also incorporates **syntax validation**: it can detect various errors in SQL (such as unbalanced parentheses or misuse of reserved keywords) and report them with details[\[5\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20can%20detect%20a%20variety,or%20raise%20depending%20on%20configurations). In short, SQLGlot provides a comprehensive toolkit for working with SQL in a programmatic way, avoiding the need for brittle regular expressions or manual string parsing.

## SQL Parsing and Validation

One of SQLGlot’s core capabilities is **parsing SQL strings into a syntax tree**. You can use sqlglot.parse\_one() to parse a single SQL statement (or sqlglot.parse() for multiple statements). The result is an Expression object (or a list of them) representing the query. The type of the root expression corresponds to the statement type – for example, a SELECT query yields a Select node, a CREATE TABLE yields a Create node, etc. (which allows easy classification of statement types by checking the AST node class). You can inspect the parsed tree via Python’s repr(): for example, repr(parse\_one("SELECT a \+ 1 AS z")) will show a Select(...) node containing an Alias of an Add expression (with a Column and a Literal child)[\[6\]](https://github.com/tobymao/sqlglot#:~:text=from%20sqlglot%20import%20parse_one%20print%28repr%28parse_one%28,a%20%2B%201%20AS%20z). This structure lets you programmatically understand the components of the SQL without executing it.

SQLGlot’s parser is robust and will raise an error if the SQL is invalid. For instance, if you try to parse a malformed query with a missing parenthesis, e.g. SELECT foo FROM (SELECT baz FROM t, the library throws a sqlglot.errors.ParseError indicating an issue (“Expecting )” at a specific location)[\[7\]](https://github.com/tobymao/sqlglot#:~:text=When%20the%20parser%20detects%20an,ParseError). These errors are provided with contextual information (line, column, and a snippet highlighting the error) for easier debugging. The error objects are also accessible programmatically (e.errors list) if you want to handle or log them in your application[\[8\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot.errors%20try%3A%20sqlglot.transpile%28,errors). In addition to syntax errors, SQLGlot can warn you about **unsupported constructs** when translating between dialects – it will do a best-effort translation and emit a warning if a function or syntax has no direct equivalent, or you can configure it to raise exceptions for such cases[\[9\]](https://github.com/tobymao/sqlglot#:~:text=Unsupported%20Errors)[\[10\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot%20sqlglot.transpile%28,unsupported_level%3Dsqlglot.ErrorLevel.RAISE).

## SQL Dialect Transpilation and Formatting

A highlight of SQLGlot is its ability to **transpile SQL between different dialects** with minimal effort. Using the sqlglot.transpile() function, you can convert a SQL query from one dialect to another. For example, consider a DuckDB query that uses a DuckDB-specific function EPOCH\_MS to convert a Unix timestamp to a datetime. We can transpile this to an equivalent Hive SQL query:

import sqlglot  
sqlglot.transpile("SELECT EPOCH\_MS(1618088028295)", read="duckdb", write="hive")\[0\]  
\# Output: "SELECT FROM\_UNIXTIME(1618088028295 / POW(10, 3))"

In this example, SQLGlot recognized the DuckDB EPOCH\_MS function and converted it into Hive’s FROM\_UNIXTIME with the appropriate transformation (dividing by 10^3)[\[11\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot%20sqlglot.transpile%28,0). The library handles many such dialect-specific differences automatically. In fact, SQLGlot supports dozens of built-in dialects and will adjust not just functions but also syntax quirks, data types, and identifier quoting conventions as needed.

For instance, when targeting Spark SQL, SQLGlot knows that Spark requires backticks for delimited identifiers and prefers the type name FLOAT instead of REAL. If you transpile a query to Spark with identify=True (to enforce identifier quoting) and pretty=True (for formatting), the output will have all identifiers in backticks and any CAST(... AS REAL) will be converted to CAST(... AS FLOAT)[\[12\]](https://github.com/tobymao/sqlglot#:~:text=,a). It also automatically **formats** the SQL into a readable, indented style if pretty=True is set. Comments in the SQL are preserved on a best-effort basis during parsing and rewriting, so things like /\* ... \*/ or \-- ... comments are kept in the output SQL when possible[\[13\]](https://github.com/tobymao/sqlglot#:~:text=Comments%20are%20also%20preserved%20on,effort%20basis).

SQLGlot’s formatting capabilities mean you can use it as a **SQL code formatter**. It will standardize spacing, line breaks, and casing (if you want) across your queries, which is helpful for maintaining a consistent style. Combined with dialect transpiling, this makes it easy to integrate into tools that migrate SQL from one system to another or for automated code reviews to enforce SQL standards.

## Query Analysis and Metadata Extraction

Because SQLGlot builds a rich AST for each query, it enables powerful **analysis of SQL queries**. You can easily extract **metadata** such as the tables and columns used in a query without resorting to regex. The Expression tree comes with helper methods like find\_all to retrieve specific types of nodes. For example, to get all column references or table names in a query:

from sqlglot import parse\_one, exp  
query \= parse\_one("SELECT a, b \+ 1 AS c FROM orders")  
\# List all columns (including aliases)  
for col in query.find\_all(exp.Column):  
    print(col.alias\_or\_name)   \# Outputs: a, c  
\# List all table names  
for tbl in query.find\_all(exp.Table):  
    print(tbl.name)            \# Outputs: orders

In the above snippet, find\_all(exp.Column) finds both the a and the aliased expression c as columns[\[14\]](https://github.com/tobymao/sqlglot#:~:text=,find_all%28exp.Column%29%3A%20print%28column.alias_or_name), and find\_all(exp.Table) finds the table orders[\[15\]](https://github.com/tobymao/sqlglot#:~:text=,find_all%28exp.Table%29%3A%20print%28table.name). Each Column or Table node has properties that you can inspect (e.g. col.name vs col.alias, tbl.name for table name, and tbl.db if a database/schema was specified). This makes it straightforward to gather **dependencies** of a query, such as which tables it reads from or writes to.

Using these features, one can build tools for **data lineage** and **impact analysis**. For instance, if you have nested queries or Common Table Expressions (CTEs), you can iterate through each CTE and parse its subquery to find what base tables it depends on. The example below demonstrates building a dependency map of CTE names to the underlying table names they use:

dependencies \= {}  
for cte in parse\_one(sql\_with\_ctes).find\_all(exp.CTE):  
    dependencies\[cte.alias\_or\_name\] \= \[\]  
    subquery\_sql \= cte.this.sql()      \# get the SQL of the CTE subquery  
    for tbl in parse\_one(subquery\_sql).find\_all(exp.Table):  
        dependencies\[cte.alias\_or\_name\].append(tbl.name)  
print(dependencies)  
\# Example output: {'cte1': \['base\_table'\], 'cte2': \['cte1'\], 'cte3': \['cte1', 'cte2'\]}

In this hypothetical example, cte1 selects from a base\_table, cte2 selects from cte1, and cte3 selects from both cte1 and cte2, yielding the dependency graph shown in the output[\[16\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=for%20cte%20in%20parse_one%28query%29.find_all%28exp.CTE%29%3A%20dependencies,). This kind of analysis is extremely useful for understanding complex SQL (e.g. multiple nested views or CTEs), performing **column lineage tracking**, or populating a data catalog with query usage information.

Other analysis tasks include identifying all columns used in a query (for field-level lineage or usage metrics), detecting patterns like joins or aggregations, and classifying query type (SELECT vs DML vs DDL) by examining the AST root. All of these can be done with SQLGlot’s parse tree, which provides a far more reliable approach than ad-hoc string parsing. In fact, users have reported that tasks like building a dependency graph, which would have required complicated recursive regex parsing, became **trivial with SQLGlot** – often accomplished in just a few lines of code[\[17\]](https://www.reddit.com/r/Python/comments/18bprha/sqlglot_amazing_sql_parsing_library/#:~:text=Then%20I%20stumbled%20upon%20sqlglot%2C,barely%20more%20complex%20than%20this).

## Programmatic SQL Construction and Modification

SQLGlot not only parses existing SQL, but also allows you to **generate or modify SQL using Python code**. It provides a fluent API to construct SQL expressions and statements dynamically. For example, you can programmatically build a query using the helper functions select(), from\_(), where(), etc., instead of writing SQL strings by hand:

from sqlglot import select, condition, parse\_one  
\# Build a new SQL query expression  
where\_expr \= condition("x=1").and\_("y=1")  
query\_expr \= select("\*").from\_("y").where(where\_expr)  
print(query\_expr.sql())    
\# Output: SELECT \* FROM y WHERE x \= 1 AND y \= 1

In this snippet, we built a WHERE clause expression from a condition and then composed a SELECT query with it. The sql() method of the expression renders the final SQL string. Under the hood, this approach is building the AST node by node (Select \-\> From \-\> Where \-\> etc.) rather than relying on string concatenation. SQLGlot supports incrementally building up queries in this manner[\[18\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20supports%20incrementally%20building%20SQL,expressions), which is useful for applications that need to generate SQL (for example, a query builder UI or an ORM-like tool).

You can also **modify parts of an existing query** by manipulating the parsed AST. Since the AST nodes have methods corresponding to SQL clauses, it’s easy to change them. For instance, to replace the table in an existing query:

expr \= parse\_one("SELECT x FROM y")  
expr.from\_("z")  \# change the FROM table from 'y' to 'z'  
print(expr.sql())    
\# Output: SELECT x FROM z

Here we parsed a simple query and then called .from\_("z") on the resulting expression, effectively editing the AST to point to a different table, before regenerating the SQL[\[19\]](https://github.com/tobymao/sqlglot#:~:text=from%20sqlglot%20import%20parse_one%20parse_one%28,sql). You could similarly change the SELECT list, add/remove filters, joins, or any other part of the query by altering the AST nodes. SQLGlot ensures that when you call sql() on the modified tree, you get a valid SQL string reflecting your changes. There’s also a lower-level transform() method that lets you apply a transformation function to every node in the tree (or those of a certain type) in a single pass[\[20\]](https://github.com/tobymao/sqlglot#:~:text=expression_tree%20%3D%20parse_one%28,x) – which is powerful for bulk editing, like renaming all occurrences of a column or wrapping certain expressions with a function.

## Query Optimization and Standardization

SQLGlot includes an **optimizer** component that can rewrite queries into a canonical, optimized form. By calling sqlglot.optimizer.optimize(expression, \*\*kwargs), you let SQLGlot apply a series of rewrite rules and simplifications to the query AST. These optimization techniques include things like simplifying boolean expressions, normalizing SQL syntax (e.g., making implicit joins explicit), folding constants, inferring and annotating data types, and more[\[21\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20can%20rewrite%20queries%20into,foundations%20for%20implementing%20an%20actual). The result is a new AST (and SQL string) that is semantically equivalent to the original query but in a standardized form.

For example, SQLGlot’s optimizer can take a query with complex boolean logic or date arithmetic and rewrite it in a more normalized way (possibly to aid comparison or execution). It can qualify all column references with table names, reorder predicates, and apply **type inference** to transform expressions (especially if you provide a schema for the tables involved). Some optimization rules (like type annotation or qualification) are not enabled by default due to performance, but you can opt-in by supplying parameters or a schema. The outcome of optimization is useful for tasks such as comparing query structures (diffing two queries logically), generating execution plans, or simply cleaning up SQL from user inputs.

There’s even a utility sqlglot.diff() that computes a semantic **diff between two SQL queries**, outputting the list of changes required to turn one AST into the other. This can identify if two queries are equivalent or highlight the specific differences in SELECT list, filters, etc., in a programmatic way[\[22\]](https://github.com/tobymao/sqlglot#:~:text=diff%28parse_one%28,b%2C%20d)[\[23\]](https://github.com/tobymao/sqlglot#:~:text=this%3DIdentifier,). This is part of SQLGlot’s goal to provide deeper introspection into SQL structure.

## Execution Engine for SQL

SQLGlot goes beyond static analysis and offers a basic **SQL execution engine**. This engine can **interpret and execute SQL queries on Python data structures** (like lists of dicts, Pandas DataFrames, etc.). For example, you can provide a dictionary of table name to rows (a list of dictionaries for each row), and execute a SELECT query on it:

from sqlglot.executor import execute

tables \= {  
    "orders": \[{"id": 1, "user\_id": 1}, {"id": 2, "user\_id": 2}\],  
    "items":  \[{"order\_id": 1, "price": 100}, {"order\_id": 1, "price": 50}\],  
}  
result \= execute(  
    "SELECT o.user\_id, SUM(i.price) AS total\_price FROM orders o JOIN items i ON o.id \= i.order\_id GROUP BY o.user\_id",  
    tables=tables  
)  
print(result)  
\# Prints a tabular result, e.g., user\_id  total\_price; 1 150; 2 0; ...

Under the hood, the SQLGlot executor is evaluating the join and aggregation in pure Python. This engine is **not intended for high-performance use**, but it is very handy for **unit tests, demos, or executing queries on in-memory data**[\[24\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20able%20to%20interpret,such%20as%20Arrow%20and%20Pandas). It supports a decent subset of SQL (selects, joins, group by, etc.) to allow quick experimentation. The design also allows plugging in more efficient backends – for instance, you could integrate it with Apache Arrow or Pandas to accelerate the computation on larger data sets[\[24\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20able%20to%20interpret,such%20as%20Arrow%20and%20Pandas). Essentially, SQLGlot’s execution feature lets you run SQL natively within a Python environment, treating Python objects as your database. This is a great way to validate that a transformed query produces the expected results, or to emulate a database for testing purposes.

## Extensibility and Custom Dialects

SQLGlot is built with **extensibility** in mind. It provides the ability to define **custom SQL dialects** or extend existing ones. If you have a SQL variant that is not supported out-of-the-box or you need to handle non-standard syntax, you can subclass the Dialect class and override its rules. For example, you might create a custom dialect that recognizes new keywords or data types, or changes how certain expressions are generated. In the SQLGlot codebase, each dialect defines its own tokenizer and generator. Here's a simplified glimpse of how one could add custom keyword mappings:

from sqlglot.dialects.dialect import Dialect  
from sqlglot import exp, tokens, TokenType

class CustomDialect(Dialect):  
    class Tokenizer(tokens.Tokenizer):  
        \# Define which quotes and identifiers style this dialect uses  
        QUOTES \= \["'", '"'\]  
        IDENTIFIERS \= \["\`"\]  
        \# Extend the base set of SQL keywords:  
        KEYWORDS \= {  
            \*\*tokens.Tokenizer.KEYWORDS,  
            "INT64": TokenType.BIGINT,  
            "FLOAT64": TokenType.DOUBLE,  
        }

    class Generator(Dialect.Generator):  
        \# Example: customize how Array expressions are rendered in this dialect  
        TRANSFORMS \= { exp.Array: lambda self, e: f"\[{self.expressions(e)}\]" }

In the above sketch, we created a CustomDialect that treats INT64 as an alias for BIGINT and FLOAT64 as DOUBLE[\[25\]](https://github.com/tobymao/sqlglot#:~:text=class%20Custom,IDENTIFIERS%20%3D). We also overrode how array literals are generated (using square brackets). By registering this dialect (e.g., via Dialect.add("custom", CustomDialect)), we could then parse and transpile SQL using dialect="custom". This extensibility means SQLGlot can be adapted to new SQL-like languages or proprietary database syntaxes relatively easily, by leveraging the existing parser framework and just tweaking the parts necessary for the new dialect.

Beyond custom dialects, developers can also customize the **parsing and generation behavior** through other means – for example, by adjusting error handling levels (as mentioned earlier for unsupported features), or by writing custom transformation functions to apply across AST nodes. The library’s design balances powerful default behavior with the flexibility to handle edge cases as needed.

## Use Cases and Applications

SQLGlot’s rich feature set unlocks a wide range of applications across data engineering, analytics, and development:

* **SQL Query Translation between Systems:** Easily convert SQL queries from one SQL engine to another (e.g., MySQL to Spark SQL, Oracle to Postgres) while handling differences in functions and types automatically. This is valuable for database migration projects or building database-agnostic tools[\[26\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=%E2%86%92%20Dialect%20translation%3A%20SQL%20parsing,query%20to%20different%20SQL%20dialects)[\[27\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=,and%20many%20more%E2%80%A6).

* **Data Lineage and Dependency Analysis:** Parse query logs or view definitions to extract which tables and columns are being used. For example, a data observability platform can use SQLGlot to identify popular tables, unused columns, or build a lineage graph of how data flows through views and queries[\[28\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=SQL%20Parsing%20Use%20Cases%20%28non,list). The ability to accurately get dependencies (as shown earlier) is a primary reason to prefer SQLGlot over regex-based parsing.

* **Automated Documentation and Business Logic Extraction:** Organizations often embed business rules in SQL (e.g., in ETL or BI queries). SQLGlot can help extract these transformations and filters, enabling generation of documentation or summary of logic. By parsing and analyzing the AST, one can programmatically pull out pieces of the logic (such as all the conditions applied to a certain field) for review and documentation[\[29\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=a%20articular%20table%2C%20table%20usage,by%20users%2Fgroups%2C%20query%20patterns%20etc).

* **Query Optimization and Analysis Tools:** Developers can build tools that analyze SQL queries for anti-patterns or potential optimizations. For instance, detecting a missing WHERE clause on a large table, or identifying Cartesian joins. SQLGlot’s AST makes it feasible to implement linting rules or to integrate with BI tools to warn users about expensive query patterns[\[30\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=%E2%86%92%20SQL%20Visualisation%20%26%20optimisation%3A,generating%20bad%20SQL%20queries).

* **SQL Formatting and Standardization:** Integrate SQLGlot into CI/CD pipelines or editors to format SQL code automatically. Teams can enforce a standard SQL style and also ensure that queries are valid and consistent. This improves readability and maintainability of SQL, especially in large codebases or analytical projects.

* **Testing SQL and Simulation:** Use the execution engine to run unit tests on SQL queries. For example, given some in-memory sample data, you can verify that a complex query returns expected results, all within a Python test suite. This is great for validating ETL code or stored procedures logic in a lightweight manner, without needing a live database.

In summary, SQLGlot provides a comprehensive, up-to-date solution for understanding and manipulating SQL programmatically. It excels at tasks that would be error-prone or labor-intensive with manual parsing – as one engineer noted, switching to SQLGlot turned a complex regex-based SQL parsing script into just a few lines of code[\[17\]](https://www.reddit.com/r/Python/comments/18bprha/sqlglot_amazing_sql_parsing_library/#:~:text=Then%20I%20stumbled%20upon%20sqlglot%2C,barely%20more%20complex%20than%20this). By leveraging SQLGlot’s parsing, analysis, and generation capabilities, developers and data engineers can build smarter tools that **truly understand SQL** – enabling everything from automated query rewriting to lineage tracking – all while avoiding the pitfalls of regular expression hacks. With SQLGlot, your applications can treat SQL as a first-class, analyzable structure rather than an opaque string, leading to more robust and intelligent handling of SQL in any context.

**Sources:**

1. Toby Mao, *SQLGlot – Python SQL Parser and Transpiler* (GitHub README)[\[1\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20a%20no,SQL%20in%20the%20targeted%20dialects)[\[2\]](https://github.com/tobymao/sqlglot#:~:text=It%20is%20a%20very%20comprehensive,being%20written%20purely%20in%20Python)[\[5\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20can%20detect%20a%20variety,or%20raise%20depending%20on%20configurations)[\[11\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot%20sqlglot.transpile%28,0)[\[12\]](https://github.com/tobymao/sqlglot#:~:text=,a)[\[13\]](https://github.com/tobymao/sqlglot#:~:text=Comments%20are%20also%20preserved%20on,effort%20basis)[\[14\]](https://github.com/tobymao/sqlglot#:~:text=,find_all%28exp.Column%29%3A%20print%28column.alias_or_name)[\[15\]](https://github.com/tobymao/sqlglot#:~:text=,find_all%28exp.Table%29%3A%20print%28table.name)[\[18\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20supports%20incrementally%20building%20SQL,expressions)[\[19\]](https://github.com/tobymao/sqlglot#:~:text=from%20sqlglot%20import%20parse_one%20parse_one%28,sql)[\[21\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20can%20rewrite%20queries%20into,foundations%20for%20implementing%20an%20actual)[\[24\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20able%20to%20interpret,such%20as%20Arrow%20and%20Pandas).

2. Anup Kumar Ray, “SQL Parsing using SQLGlot” – *Medium article (Aug 2023\)*[\[26\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=%E2%86%92%20Dialect%20translation%3A%20SQL%20parsing,query%20to%20different%20SQL%20dialects)[\[30\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=%E2%86%92%20SQL%20Visualisation%20%26%20optimisation%3A,generating%20bad%20SQL%20queries)[\[31\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=from%20sqlglot%20import%20parse_one%2C%20exp,Table)[\[16\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=for%20cte%20in%20parse_one%28query%29.find_all%28exp.CTE%29%3A%20dependencies,).

3. Reddit discussion – *"sqlglot \- Amazing SQL parsing library" (r/Python)*[\[17\]](https://www.reddit.com/r/Python/comments/18bprha/sqlglot_amazing_sql_parsing_library/#:~:text=Then%20I%20stumbled%20upon%20sqlglot%2C,barely%20more%20complex%20than%20this).

---

[\[1\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20a%20no,SQL%20in%20the%20targeted%20dialects) [\[2\]](https://github.com/tobymao/sqlglot#:~:text=It%20is%20a%20very%20comprehensive,being%20written%20purely%20in%20Python) [\[3\]](https://github.com/tobymao/sqlglot#:~:text=,117) [\[5\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20can%20detect%20a%20variety,or%20raise%20depending%20on%20configurations) [\[6\]](https://github.com/tobymao/sqlglot#:~:text=from%20sqlglot%20import%20parse_one%20print%28repr%28parse_one%28,a%20%2B%201%20AS%20z) [\[7\]](https://github.com/tobymao/sqlglot#:~:text=When%20the%20parser%20detects%20an,ParseError) [\[8\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot.errors%20try%3A%20sqlglot.transpile%28,errors) [\[9\]](https://github.com/tobymao/sqlglot#:~:text=Unsupported%20Errors) [\[10\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot%20sqlglot.transpile%28,unsupported_level%3Dsqlglot.ErrorLevel.RAISE) [\[11\]](https://github.com/tobymao/sqlglot#:~:text=import%20sqlglot%20sqlglot.transpile%28,0) [\[12\]](https://github.com/tobymao/sqlglot#:~:text=,a) [\[13\]](https://github.com/tobymao/sqlglot#:~:text=Comments%20are%20also%20preserved%20on,effort%20basis) [\[14\]](https://github.com/tobymao/sqlglot#:~:text=,find_all%28exp.Column%29%3A%20print%28column.alias_or_name) [\[15\]](https://github.com/tobymao/sqlglot#:~:text=,find_all%28exp.Table%29%3A%20print%28table.name) [\[18\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20supports%20incrementally%20building%20SQL,expressions) [\[19\]](https://github.com/tobymao/sqlglot#:~:text=from%20sqlglot%20import%20parse_one%20parse_one%28,sql) [\[20\]](https://github.com/tobymao/sqlglot#:~:text=expression_tree%20%3D%20parse_one%28,x) [\[21\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20can%20rewrite%20queries%20into,foundations%20for%20implementing%20an%20actual) [\[22\]](https://github.com/tobymao/sqlglot#:~:text=diff%28parse_one%28,b%2C%20d) [\[23\]](https://github.com/tobymao/sqlglot#:~:text=this%3DIdentifier,) [\[24\]](https://github.com/tobymao/sqlglot#:~:text=SQLGlot%20is%20able%20to%20interpret,such%20as%20Arrow%20and%20Pandas) [\[25\]](https://github.com/tobymao/sqlglot#:~:text=class%20Custom,IDENTIFIERS%20%3D) GitHub \- tobymao/sqlglot: Python SQL Parser and Transpiler

[https://github.com/tobymao/sqlglot](https://github.com/tobymao/sqlglot)

[\[4\]](https://sqlglot.com/sqlglot/expressions.html#:~:text=Every%20AST%20node%20in%20SQLGlot,of%20all%20supported%20Expression%20types) sqlglot.expressions API documentation

[https://sqlglot.com/sqlglot/expressions.html](https://sqlglot.com/sqlglot/expressions.html)

[\[16\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=for%20cte%20in%20parse_one%28query%29.find_all%28exp.CTE%29%3A%20dependencies,) [\[26\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=%E2%86%92%20Dialect%20translation%3A%20SQL%20parsing,query%20to%20different%20SQL%20dialects) [\[27\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=,and%20many%20more%E2%80%A6) [\[28\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=SQL%20Parsing%20Use%20Cases%20%28non,list) [\[29\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=a%20articular%20table%2C%20table%20usage,by%20users%2Fgroups%2C%20query%20patterns%20etc) [\[30\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=%E2%86%92%20SQL%20Visualisation%20%26%20optimisation%3A,generating%20bad%20SQL%20queries) [\[31\]](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59#:~:text=from%20sqlglot%20import%20parse_one%2C%20exp,Table) SQL Parsing using SQLGlot. Structured query language (SQL) has… | by Anup Kumar Ray | Medium

[https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59](https://medium.com/@anupkumarray/sql-parsing-using-sqlglot-ad8a3c7fac59)

[\[17\]](https://www.reddit.com/r/Python/comments/18bprha/sqlglot_amazing_sql_parsing_library/#:~:text=Then%20I%20stumbled%20upon%20sqlglot%2C,barely%20more%20complex%20than%20this) sqlglot \- Amazing SQL parsing library : r/Python

[https://www.reddit.com/r/Python/comments/18bprha/sqlglot\_amazing\_sql\_parsing\_library/](https://www.reddit.com/r/Python/comments/18bprha/sqlglot_amazing_sql_parsing_library/)

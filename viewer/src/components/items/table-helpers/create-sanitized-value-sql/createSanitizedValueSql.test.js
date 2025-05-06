import createSanitizedValueSql from "./createSanitizedValueSql";

describe("createSanitizedValueSql", () => {
  it("should create a SQL expression that sanitizes a value field for numeric operations", () => {
    const fieldName = "value_field";
    const expectedSql = `
      COALESCE(
        TRY_CAST(
          CASE
            WHEN REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    CAST("value_field" AS VARCHAR),
                    '$', ''  -- Remove dollar signs
                  ),
                  '€', ''    -- Remove euro signs
                ),
                ',', ''     -- Remove commas
              ),
              ' ', ''      -- Remove spaces
            ) = '-' THEN NULL
            ELSE REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    CAST("value_field" AS VARCHAR),
                    '$', ''
                  ),
                  '€', ''
                ),
                ',', ''
              ),
              ' ', ''
            )
          END AS DOUBLE
        ),
        0
      )`;
    expect(createSanitizedValueSql(fieldName)).toEqual(expectedSql);
  });
});

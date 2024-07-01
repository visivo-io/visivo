from .base.base_model import BaseModel

"""
Tests allow you to assert on the computed values that are the output of a trace.  The tests are run with the `visivo test` command.

### Example
``` yaml
traces:
    - name: Tested Trace
      model: ref(model)
      columns:
          account_name: account_name
      props:
          type: scatter
          x: column(project_created_at)
          y: column(project_name)
      tests:
        - logic: assert_that(numpy.sum(Tested Trace.props.x)).is_equal_to(7)
```
The [assertpy](https://assertpy.github.io/) and [numpy](https://numpy.org/doc/stable/index.html) libraries are available for testing.
"""


class Test(BaseModel):
    logic: str

    __test__ = False

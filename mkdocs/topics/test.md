CSV Script Models are a type of model that executes a command with a given set of args.
This command needs to return a well formatted :fontawesome-solid-file-csv: with a header row.

The header row will be used to create a table in a sqlite file that traces are able to reference.

The args are python subprocess list args. You can read their source
[documented here](https://docs.python.org/3/library/subprocess.html#subprocess.CompletedProcess.args).

## Examples
{% raw %}
=== "Echo"

    ``` yaml
    models:
        - name: csv
        args:
            - echo
            - |
                x,y
                1,9
                2,1
                3,2
                4,3
                5,5
                6,8
    ```
=== "Python Script"

    ``` python title="created_processes_csv.py"
    import subprocess
    import csv

    # Define the CSV file to write
    csv_file = "target/processes.csv"

    # Execute the 'ps aux' command
    result = subprocess.run(["ps", "aux"], stdout=subprocess.PIPE, text=True)

    # Split the output into lines
    lines = result.stdout.strip().split("/\n")

    # Write to CSV
    with open(csv_file, mode="w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(
            ["USER","PID","%CPU","%MEM","VSZ","RSS","TTY","STAT","START","TIME","COMMAND"]
        )  # Header

        for line in lines[1:]:  # Skip the header line from the ps output
            row = line.split(None, 10)  # Split on whitespace, but only for the first 10 columns
            writer.writerow(row)
    ```
    Visivo can then call your python script like so-
    ``` yaml
    models:
        - name: processes
        args:
            - python
            - create_processes_csv.py
            - '&&'
            - cat target/processes.csv
    ```
{% endraw %}
So there you have it examples.
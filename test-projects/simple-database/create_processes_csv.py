import subprocess
import csv

# Define the CSV file to write
csv_file = "target/processes.csv"

# Execute the 'ps aux' command
result = subprocess.run(["ps", "aux"], stdout=subprocess.PIPE, text=True)

# Split the output into lines
lines = result.stdout.strip().split("\n")

# Write to CSV
with open(csv_file, mode="w", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(
        [
            "USER",
            "PID",
            "%CPU",
            "%MEM",
            "VSZ",
            "RSS",
            "TTY",
            "STAT",
            "START",
            "TIME",
            "COMMAND",
        ]
    )  # Header

    for line in lines[1:]:  # Skip the header line from the ps output
        row = line.split(
            None, 10
        )  # Split on whitespace, but only for the first 10 columns
        writer.writerow(row)

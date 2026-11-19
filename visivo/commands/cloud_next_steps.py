from visivo.models.example_type import ExampleTypeEnum

AUTHORIZE_COMMAND = "visivo authorize"
DEPLOY_COMMAND = "visivo deploy --branch main"

SAMPLE_AGENT_PROMPTS = {
    ExampleTypeEnum.github_releases: (
        "Add a bar chart of total downloads by repo to the GitHub Releases Overview dashboard."
    ),
    ExampleTypeEnum.ev_sales: (
        "Add a bar chart of total revenue by region to the EV Sales Overview dashboard."
    ),
    ExampleTypeEnum.college_football: (
        "Add a bar chart of total attendance by conference to the "
        "College Football Overview dashboard."
    ),
}


def sample_agent_prompt(example_type):
    try:
        return SAMPLE_AGENT_PROMPTS.get(ExampleTypeEnum(example_type))
    except ValueError:
        return None


def cloud_next_steps(example_type) -> str:
    lines = [
        "Publish this to Visivo Cloud:",
        f"  {AUTHORIZE_COMMAND}",
        f"  {DEPLOY_COMMAND}",
    ]
    prompt = sample_agent_prompt(example_type)
    if prompt:
        lines += ["", "Try this in the Agent tab:", f'  "{prompt}"']
    return "\n".join(lines)


def log_cloud_next_steps(example_type) -> None:
    from visivo.logger.logger import Logger

    Logger.instance().info(cloud_next_steps(example_type))

from pydantic import BaseModel, TypeAdapter
from typing import Any

class ContextString:
    def __init__(self, value: str):
        self.value = value

    def __str__(self):
        return self.value

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, _handler: Any):
        # Define the serialization/deserialization schema for Pydantic
        def validate(value: str) -> 'ContextString':
            return cls(value)
        
        return {
            'type': 'str',
            'serialization': {
                'method': 'to_string',
                'function': str,
            },
            'validation': validate,
        }
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

# converts Python snake_case fields to camelCase when serialized to JSON
class CamelCase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

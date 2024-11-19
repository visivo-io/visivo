from typing import Union, List, ClassVar, Dict
from pydantic import BaseModel, Field, model_validator

class ColorPalette(BaseModel):
    palette: Union[List[str], str] = Field(
        "High Contrast",
        description="""string or list of colors<br>Sets the default trace colors. Can be either a list of colors or a string corresponding to a palette name."""
    )

    PREDEFINED_PALETTES: ClassVar[Dict[str, List[str]]] = {
        "Warm Earth Tones": [
            "#713B57", "#D25946",'#8C8A6B', '#A05A4F', '#BCAF9D',
            '#D5C4A1', '#F5E1DA', '#BF616A', '#A3A5A9', '#2C2C2C'
        ],
        "Sunset Over Water": [
            "#713B57", '#36454F', '#729EA1', "#D25946", '#A4B494',
            '#DCAB6B', '#DD6E42', '#F7CB46', '#FFE156', '#9D8480'
        ],
        "Muted Vintage": [
            "#713B57", '#96705B', '#A08C79', "#D25946", '#6D7D8A',
            '#A89E9D', '#E1D2CA', '#BFB6B2', '#E0AF87', '#4A4A48'
        ],
        "Retro Pop": [
            "#713B57", '#6A0572', '#F49FBC', '#8C215B', "#D25946",
            '#F27D52', '#F2C3A0', '#EB9486', '#D4A5A5', '#2F2F2F'
        ],
        "Forest Nightfall": [
            "#713B57", '#4A6655', '#7B9C78', '#A3A5A9', '#627264',
            "#D25946", '#B77B67', '#E6D4A7', '#DED7B1', '#483C32'
        ],
        "Desert Sunrise": [
            "#713B57", '#A67C52', '#C29E7A', "#D25946", '#F7C59F',
            '#F0E4C8', '#D9A57B', '#B87E5C', '#4B3F3D', '#7A5C61'
        ],
        "Urban Dusk": [
            "#713B57", '#2E2E3A', "#D25946", '#4E5166', '#6B717E',
            '#888FA3', '#A5B0C2', '#CCD6DD', '#C27675', '#A66869', '#4D4D51'
        ],
        "Botanical Garden": [
            "#713B57", '#2E4D3A', '#4A6A5C', '#678A75', "#D25946",
            '#B5C6B2', '#8FB4A2', '#A7A29C', '#5B524A', '#31302E'
        ],
        "Autumn Ember": [
            "#713B57", '#8C5A45', '#B3715F', "#D25946", '#D39E8A',
            '#E8C2AD', '#F1D1BC', '#997D68', '#5F4841', '#3D3533'
        ],
        "Coastal Breeze": [
            "#713B57", '#52757D', '#71949B', '#98B4BB', "#D25946",
            '#C2D5D8', '#DDEBEF', '#B5C8CA', '#678381', '#4A5C61', '#313D3F'
        ],
        "Muted Vintage II": [
            "#713B57", '#8D6E63', '#A1887F', "#D25946", '#C2B4A4',
            '#E0D3C6', '#B09A8A', '#9C7F6B', '#B19774', '#4B4742'
        ],
        "Muted Rosewood": [
            "#713B57", '#B96D63', '#D8B4A0', "#D25946", '#A18C74',
            '#CE9E6F', '#D9C4B0', '#E4D1C3', '#927D69', '#6D625D', '#3F3936'
        ],
        "Muted Classic": [
            "#713B57", '#5E524D', '#A89A8E', "#D25946", '#C1AE9A',
            '#DAC2A8', '#CAB3A6', '#8C7D77', '#BFAF9A', '#574E4A', '#3A3532'
        ],
        "Vintage Pastel": [
            "#713B57", '#E3CAB5', '#D8BBA9', "#D25946", '#BC9D8A',
            '#A4806A', '#8E7267', '#D0B49F', '#CABAAE', '#5C5049', '#423B36'
        ],
        "Classic Faded": [
            "#713B57", '#9E7762', '#A6908A', "#D25946", '#C3A99D',
            '#E8D5BF', '#BAA998', '#85786B', '#9E8C7A', '#625C55', '#4A433D'
        ],
        "Spring Blossom": [
            "#A7799E", '#FFDBA4', '#FFD9C0', "#FFAD9B", '#C3F0CA',
            '#A0E3D0', '#FFE3E3', '#D7C5E2', '#B4A7D6', '#F5CCDE'
        ],
        "Mint Dream": [
            "#A7799E", '#C5F0C9', '#E6F5D0', "#FFAD9B", '#B3E5C3',
            '#ACE2D7', '#FFDEE9', '#FEE1BA', '#F3C7CA', '#E6DFE0'
        ],
        "Soft Sunset": [
            "#A7799E", '#FFB7A5', '#FFDAC1', "#FFAD9B", '#FFD6D6',
            '#E3CDD3', '#F2E3D5', '#E6B8B9', '#C9B7D1', '#BFD4D5', '#D3C4C9'
        ],
        "Lavender Fields": [
            "#A7799E", '#E6C9E6', '#E6D3EC', "#FFAD9B", '#D9BFEA',
            '#C5A8E6', '#D9DBF2', '#FFEBF5', '#FFE0EC', '#E4C3E1', '#BAACC5'
        ],
        "Summer Breeze": [
            "#A7799E", '#FFF0C1', '#FFE8B0', "#FFAD9B", '#F9D6B3',
            '#FFCDD2', '#FFDFC7', '#B5E1E0', '#E1F2E7', '#FFD1D1', '#ECD4A6'
        ],
        "Mint Dream Contrast": [
            "#A7799E", '#88C2B8', '#D1E8CF', "#FFAD9B", '#A8D1BB',
            '#68B09A', '#FFCAC2', '#F2AFA5', '#E5B3B3', '#B8CCC9', '#8A9FA1'
        ],
        "Mint Dream Dark": [
            "#A7799E", '#4E7A75', '#A2B8A5', "#FFAD9B", '#8C9B86',
            '#5D9A85', '#FFA3B0', '#D1908B', '#A6B3A1', '#7B9C94', '#577375'
        ],
        "Mint Dream Deep": [
            "#A7799E", '#5E958C', '#A3C9B3', "#FFAD9B", '#A9A88E',
            '#87A18D', '#E99997', '#C98A85', '#AEB1A0', '#6A8578', '#4A645E'
        ],
        "Mint Dream Bold": [
            "#A7799E", '#70C1B3', '#A9E2D6', "#FFAD9B", '#98BFAB',
            '#4DA285', '#FFACA8', '#F38F8D', '#B3A19C', '#8E9D94', '#6B8B82'
        ],
        "High Contrast": [
            "#713B57", '#FFB400', '#003F91', "#D25946", '#1CA9C9',
            '#999999', '#E63946', '#A8DADC', '#457B9D', '#2B2B2B'
        ],
        "High Contrast Earth": [
            "#713B57", '#F4A259', '#4A4A4A', '#FFDD87', "#D25946",
            '#D9BF77', '#624D46', '#F1C27D', '#6E7B64', '#0B3954'
        ]
    }

    @model_validator(mode='before')
    @classmethod 
    def validate_palette(cls, data: dict) -> dict:
        v = data.get('palette')
        
        if v is None:
            return data
        
        if isinstance(v, str):
            if v not in cls.PREDEFINED_PALETTES:
                raise ValueError(f"Invalid palette name. Choose from: {', '.join(cls.PREDEFINED_PALETTES.keys())}")
            data['palette'] = cls.PREDEFINED_PALETTES[v]
            return data
        
        if isinstance(v, list):
            for color in v:
                if not isinstance(color, str):
                    raise ValueError("All colors must be strings")
            return data
            
        raise ValueError("colors must be either a palette name or list of colors")

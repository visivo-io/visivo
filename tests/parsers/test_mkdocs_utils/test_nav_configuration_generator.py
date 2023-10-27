from visivo.parsers.mkdocs_utils.nav_configuration_generator import find_path, replace_using_path

TEST_OBJECT = {
        'nav': [
            {'getting started': 'index.md'},
            {'including': 'index.md'},
            {'reference': [
                {'configuration': {'trace': [], 'chart': []}},
                {'cli': 'index.md'}
            ]}
        ]
    }

def test_find_path():
    path = find_path(object=TEST_OBJECT, key='configuration')
    assert ['nav', 2, 'reference', 0, 'configuration'] == path

def test_replace_path():
    path = ['nav', 2, 'reference', 0, 'configuration'] 
    new_object = replace_using_path(TEST_OBJECT, path=path, new_value={'mom look', 'it worked'})
    assert new_object.get('nav')[2].get('reference')[0]['configuration'] == {'mom look', 'it worked'}
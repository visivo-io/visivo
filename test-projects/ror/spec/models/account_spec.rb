require 'rails_helper'

RSpec.describe 'Account' do           
    context 'basic spec' do  
        let(:account) { Account.create(name: "name") }
        it 'should have correct name value' do   
            expect(account.name).to eq('name')  
        end
    end
end
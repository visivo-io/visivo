

# ActiveRecord::Base.configurations.find_db_config('test')

require 'rails_helper'

RSpec.describe 'Simple Line', :type => :trace do           
    context 'before publication' do
        before do
            Account.create(created_at: DateTime.new(2023, 2, 1))
            Account.create(created_at: DateTime.new(2023, 2, 2))
            Account.create(created_at: DateTime.new(2023, 2, 9))
            Account.create(created_at: DateTime.new(2023, 2, 16))
        end 

        let(:trace_name) {
            'Accounts per Week'
        }

        it 'should have correct count values' do
            expect(trace_data["values"]['props.y']).to eq([1, 1, 2])  
        end

        it 'should have correct week values' do
            expect(trace_data["values"]['props.x']).to eq(["2023-02-12", "2023-02-05", "2023-01-29"])  
        end
    end
end
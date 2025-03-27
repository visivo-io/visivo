RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups

  RSpec.shared_context "Trace spec helpers" do
    let(:visivo_tmp_folder) {"tmp/visivo"}
    let(:trace_data){
      value = %x( visivo compile -o "#{visivo_tmp_folder}" -s development)
      raise "Error running external Visivo command" if $?.exitstatus != 0

      sql = File.read("tmp/visivo/traces/#{trace_name}/query.sql")
      records_array = ActiveRecord::Base.connection.execute(sql)
      File.write("#{visivo_tmp_folder}/traces/#{trace_name}/rails_data.json", records_array.to_json)
      value = %x( visivo aggregate -j "#{visivo_tmp_folder}/traces/#{trace_name}/rails_data.json" -o "#{visivo_tmp_folder}/traces/#{trace_name}")
      
      raise "Error running external Visivo command" if $?.exitstatus != 0
      JSON.parse(File.read("#{visivo_tmp_folder}/traces/#{trace_name}/data.json"))
    }
  end

  config.include_context "Trace spec helpers", :type => :trace
end

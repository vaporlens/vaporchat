Pod::Spec.new do |s|
  s.name           = 'AudioRoute'
  s.version        = '1.0.0'
  s.summary        = 'Switches voice chat audio between the earpiece and the speaker'
  s.author         = ''
  s.homepage       = 'https://github.com/yamalight/vaporchat'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.resource_bundles = { 'AudioRoute' => ['ring.wav', 'beep.wav'] }
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

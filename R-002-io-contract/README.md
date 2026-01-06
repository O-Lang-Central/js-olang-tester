# R-002 IO Contract Resolver Test

**Purpose:**  
This test validates that resolver input/output contracts are correctly recognized, including the proper handling of `Ask` and `Use` steps, and that `saveAs` values are normalized.

**Workflow:**  
- Workflow Name: `TestResolverIOContract`
- Parameters: `userInput`
- Allowed Resolvers:
  - `Calculator`
  - `WeatherService`
- Steps:
  1. `Ask Calculator` → `saveAs: calcResult`
  2. `Use WeatherService` → `saveAs: weatherInfo`
- Return Values: `calcResult, weatherInfo`

**Assertions:**  
1. Step 1 is parsed as an `ask` step with normalized `saveAs`.  
2. Step 2 is parsed as a `use` step with normalized `saveAs`.  
3. Return statement lists all resolver outputs.  
4. No parser warnings are generated.

**Spec References:**  
- §4.3 Resolver Input/Output Contracts  
- §3.2 Step Parsing  
- §2.3 Symbol Normalization

// Provides regular expressions to validate user inputs
export default class ValidationLib {
  static urlRegex = /^(https?:\/\/)(([^.]+)\.)+(.{2,30})(\/.*)*\/?$/;
  static endpointRegex = /^\/?([-._~:?#[\]@!$&'()*+,;=%\w]+\/?)*$/;
  static phoneRegex = /^\d+$/;
}

using System.Collections.Generic;
using CobLink.Models;

namespace CobLink.Api.Infrastructure
{
    /// <summary>
    /// The envelope every /api response uses (see docs/api-reference.md). Business failures travel inside it with
    /// HTTP 200 - a deliberate legacy trait that the REST modernization replaces with proper status codes.
    /// </summary>
    public class ServiceResponse<T>
    {
        public bool Success { get; set; }

        public string Message { get; set; }

        /// <summary>VALIDATION, BUSINESS_RULE, NOT_FOUND, CONCURRENCY, FORBIDDEN, BAD_REQUEST or SERVER_ERROR.</summary>
        public string ErrorCode { get; set; }

        public List<ValidationError> Errors { get; set; } = new List<ValidationError>();

        public T Data { get; set; }

        public static ServiceResponse<T> Ok(T data)
        {
            return new ServiceResponse<T> { Success = true, Data = data };
        }

        public static ServiceResponse<T> Fail(string errorCode, string message, IEnumerable<ValidationError> errors = null)
        {
            var response = new ServiceResponse<T> { Success = false, ErrorCode = errorCode, Message = message };
            if (errors != null)
            {
                response.Errors.AddRange(errors);
            }

            return response;
        }
    }

    public static class ErrorCodes
    {
        public const string Validation = "VALIDATION";
        public const string BusinessRule = "BUSINESS_RULE";
        public const string NotFound = "NOT_FOUND";
        public const string Concurrency = "CONCURRENCY";
        public const string Forbidden = "FORBIDDEN";
        public const string BadRequest = "BAD_REQUEST";
        public const string ServerError = "SERVER_ERROR";
    }
}

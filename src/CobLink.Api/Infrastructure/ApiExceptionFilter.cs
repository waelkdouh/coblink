using System;
using CobLink.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Logging;

namespace CobLink.Api.Infrastructure
{
    /// <summary>
    /// Turns exceptions thrown by the business layer into the response envelope. Expected business failures keep
    /// HTTP 200 (legacy contract); everything unexpected becomes a 500 with a trace id and is logged.
    /// </summary>
    public class ApiExceptionFilter : IExceptionFilter
    {
        private readonly ILogger<ApiExceptionFilter> _logger;

        public ApiExceptionFilter(ILogger<ApiExceptionFilter> logger)
        {
            _logger = logger;
        }

        public void OnException(ExceptionContext context)
        {
            Exception exception = context.Exception;
            ServiceResponse<object> response;
            int statusCode = StatusCodes.Status200OK;

            var validation = exception as ValidationFailedException;
            if (validation != null)
            {
                response = ServiceResponse<object>.Fail(ErrorCodes.Validation, validation.Message, validation.Errors);
            }
            else if (exception is BusinessRuleException)
            {
                response = ServiceResponse<object>.Fail(ErrorCodes.BusinessRule, exception.Message);
            }
            else if (exception is NotFoundException)
            {
                response = ServiceResponse<object>.Fail(ErrorCodes.NotFound, exception.Message);
            }
            else if (exception is ConcurrencyException)
            {
                response = ServiceResponse<object>.Fail(ErrorCodes.Concurrency, exception.Message);
            }
            else if (exception is ForbiddenException)
            {
                statusCode = StatusCodes.Status403Forbidden;
                response = ServiceResponse<object>.Fail(ErrorCodes.Forbidden, exception.Message);
            }
            else
            {
                string traceId = context.HttpContext.TraceIdentifier;
                _logger.LogError(exception, "Unhandled exception. Trace id {TraceId}", traceId);
                statusCode = StatusCodes.Status500InternalServerError;
                response = ServiceResponse<object>.Fail(
                    ErrorCodes.ServerError,
                    "An unexpected error occurred. Quote reference " + traceId + " when you contact support.");
            }

            context.Result = new ObjectResult(response) { StatusCode = statusCode };
            context.ExceptionHandled = true;
        }
    }
}

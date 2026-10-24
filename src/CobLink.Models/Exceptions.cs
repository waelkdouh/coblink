using System;
using System.Collections.Generic;

namespace CobLink.Models
{
    public class ValidationError
    {
        public ValidationError()
        {
        }

        public ValidationError(string field, string message)
        {
            Field = field;
            Message = message;
        }

        /// <summary>camelCase name of the request property, or null for a general error.</summary>
        public string Field { get; set; }

        public string Message { get; set; }
    }

    /// <summary>Base type for errors that are expected to reach the user as a readable message.</summary>
    public abstract class CobLinkException : Exception
    {
        protected CobLinkException(string message) : base(message)
        {
        }

        protected CobLinkException(string message, Exception innerException) : base(message, innerException)
        {
        }
    }

    /// <summary>The request is malformed or breaks a field-level rule.</summary>
    public class ValidationFailedException : CobLinkException
    {
        public ValidationFailedException(IEnumerable<ValidationError> errors)
            : base("One or more validation errors occurred.")
        {
            Errors = new List<ValidationError>(errors);
        }

        public ValidationFailedException(string field, string message)
            : this(new[] { new ValidationError(field, message) })
        {
        }

        public IList<ValidationError> Errors { get; private set; }
    }

    /// <summary>The request is valid but not allowed in the current state of the business object.</summary>
    public class BusinessRuleException : CobLinkException
    {
        public BusinessRuleException(string message) : base(message)
        {
        }
    }

    public class NotFoundException : CobLinkException
    {
        public NotFoundException(string entityName, object id)
            : base(entityName + " " + id + " was not found.")
        {
            EntityName = entityName;
        }

        public string EntityName { get; private set; }
    }

    /// <summary>The row was changed by someone else after it was read (rowversion mismatch).</summary>
    public class ConcurrencyException : CobLinkException
    {
        public ConcurrencyException()
            : base("This record was changed by another user. Reload it and try again.")
        {
        }

        public ConcurrencyException(Exception innerException)
            : base("This record was changed by another user. Reload it and try again.", innerException)
        {
        }
    }

    /// <summary>The signed-in user is not allowed to perform the operation.</summary>
    public class ForbiddenException : CobLinkException
    {
        public ForbiddenException(string message) : base(message)
        {
        }
    }
}

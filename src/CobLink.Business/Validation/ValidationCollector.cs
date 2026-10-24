using System.Collections.Generic;
using CobLink.Models;

namespace CobLink.Business.Validation
{
    /// <summary>Collects field errors so a request reports every problem at once.</summary>
    public sealed class ValidationCollector
    {
        private readonly List<ValidationError> _errors = new List<ValidationError>();

        public bool HasErrors
        {
            get { return _errors.Count > 0; }
        }

        public void Add(string field, string message)
        {
            _errors.Add(new ValidationError(field, message));
        }

        /// <summary>Adds an error when the value is blank or too long. Returns the trimmed value.</summary>
        public string Required(string field, string label, string value, int maxLength)
        {
            string trimmed = Clean(value);
            if (trimmed == null)
            {
                Add(field, label + " is required.");
            }
            else if (trimmed.Length > maxLength)
            {
                Add(field, label + " cannot be longer than " + maxLength + " characters.");
            }

            return trimmed;
        }

        /// <summary>Adds an error when the value is too long. Returns the trimmed value, or null when blank.</summary>
        public string Optional(string field, string label, string value, int maxLength)
        {
            string trimmed = Clean(value);
            if (trimmed != null && trimmed.Length > maxLength)
            {
                Add(field, label + " cannot be longer than " + maxLength + " characters.");
            }

            return trimmed;
        }

        public void ThrowIfAny()
        {
            if (HasErrors)
            {
                throw new ValidationFailedException(_errors);
            }
        }

        public static string Clean(string value)
        {
            if (value == null)
            {
                return null;
            }

            string trimmed = value.Trim();
            return trimmed.Length == 0 ? null : trimmed;
        }
    }
}

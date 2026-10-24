using System.Text.Json;

namespace CobLink.TestSupport
{
    /// <summary>Deep copies so callers cannot change stored rows without going through a repository.</summary>
    internal static class Cloner
    {
        public static T Clone<T>(T value)
        {
            return JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value));
        }
    }
}

using System.Reflection;

namespace CobLink.Api.Infrastructure
{
    public static class AppVersion
    {
        /// <summary>The product version without the source revision suffix, for example 1.0.0.</summary>
        public static readonly string Current = Read();

        private static string Read()
        {
            Assembly assembly = typeof(AppVersion).Assembly;
            var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();
            string version = informational == null ? assembly.GetName().Version.ToString(3) : informational.InformationalVersion;
            int plus = version.IndexOf('+');
            return plus < 0 ? version : version.Substring(0, plus);
        }
    }
}

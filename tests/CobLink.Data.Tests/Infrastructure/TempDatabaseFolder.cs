using System;
using System.IO;
using System.Text;

namespace CobLink.Data.Tests.Infrastructure
{
    /// <summary>
    /// A throw-away "database" folder with scripts and sample-data sub-folders, for testing the deployer with
    /// scripts that are small enough to read in the test itself. Deleted on Dispose.
    /// </summary>
    public sealed class TempDatabaseFolder : IDisposable
    {
        public TempDatabaseFolder()
            : this(true, true)
        {
        }

        public TempDatabaseFolder(bool createScriptsFolder, bool createSampleDataFolder)
        {
            Root = Path.Combine(Path.GetTempPath(), "coblink-tests-" + Guid.NewGuid().ToString("N"));
            DatabaseFolder = Path.Combine(Root, "database");
            ScriptsFolder = Path.Combine(DatabaseFolder, "scripts");
            SampleDataFolder = Path.Combine(DatabaseFolder, "sample-data");

            Directory.CreateDirectory(DatabaseFolder);
            if (createScriptsFolder)
            {
                Directory.CreateDirectory(ScriptsFolder);
            }

            if (createSampleDataFolder)
            {
                Directory.CreateDirectory(SampleDataFolder);
            }
        }

        /// <summary>The temporary directory that contains the database folder.</summary>
        public string Root { get; private set; }

        public string DatabaseFolder { get; private set; }

        public string ScriptsFolder { get; private set; }

        public string SampleDataFolder { get; private set; }

        public string CreateDirectory(params string[] relativeToRoot)
        {
            string path = Root;
            foreach (string part in relativeToRoot)
            {
                path = Path.Combine(path, part);
            }

            Directory.CreateDirectory(path);
            return path;
        }

        public void AddScript(string fileName, string content)
        {
            AddScript(fileName, content, false);
        }

        public void AddScript(string fileName, string content, bool withByteOrderMark)
        {
            File.WriteAllText(Path.Combine(ScriptsFolder, fileName), content, new UTF8Encoding(withByteOrderMark));
        }

        public void AddSampleData(string fileName, string content)
        {
            File.WriteAllText(Path.Combine(SampleDataFolder, fileName), content, new UTF8Encoding(false));
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Root, true);
            }
            catch (IOException)
            {
                // Leftovers in the temp directory must not fail a test.
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }
}

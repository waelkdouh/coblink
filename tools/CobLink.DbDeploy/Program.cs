// SqlConnectionStringBuilder comes from the deliberately legacy System.Data.SqlClient provider.
#pragma warning disable CS0618
using System;
using System.Data.SqlClient;
using System.IO;
using CobLink.Data.Deployment;

namespace CobLink.DbDeploy
{
    /// <summary>
    /// Creates (when missing) and upgrades the COBLink database from the idempotent scripts in the repository's
    /// database folder. Exit codes: 0 success, 1 deployment failure, 2 usage error.
    /// </summary>
    internal static class Program
    {
        private const int ExitOk = 0;
        private const int ExitDeploymentFailed = 1;
        private const int ExitUsageError = 2;

        private static int Main(string[] args)
        {
            Arguments arguments;
            try
            {
                arguments = Arguments.Parse(args);
            }
            catch (ArgumentException ex)
            {
                return UsageError(ex.Message);
            }

            if (arguments.Help)
            {
                PrintUsage();
                return ExitOk;
            }

            string connectionString = FirstNonBlank(
                arguments.Connection,
                Environment.GetEnvironmentVariable("ConnectionStrings__CobLink"),
                Environment.GetEnvironmentVariable("COBLINK_CONNECTION"));
            if (connectionString == null)
            {
                return UsageError("No connection string. Pass --connection or set ConnectionStrings__CobLink / COBLINK_CONNECTION.");
            }

            SqlConnectionStringBuilder builder;
            try
            {
                builder = new SqlConnectionStringBuilder(connectionString);
            }
            catch (ArgumentException ex)
            {
                return UsageError("The connection string is not valid: " + ex.Message);
            }

            if (string.IsNullOrWhiteSpace(builder.InitialCatalog))
            {
                return UsageError("The connection string must name the target database (Database=<name>).");
            }

            if (arguments.Recreate && !arguments.Yes)
            {
                return UsageError("--recreate drops database '" + builder.InitialCatalog + "' and all of its data. Add --yes to confirm.");
            }

            string databaseFolder = arguments.DatabaseFolder;
            if (databaseFolder == null)
            {
                databaseFolder = DatabaseDeployer.FindDatabaseFolder(Directory.GetCurrentDirectory())
                    ?? DatabaseDeployer.FindDatabaseFolder(AppContext.BaseDirectory);
                if (databaseFolder == null)
                {
                    return UsageError("The database folder was not found. Pass --database-folder <path>.");
                }
            }
            else if (!Directory.Exists(databaseFolder))
            {
                return UsageError("The database folder does not exist: " + databaseFolder);
            }

            databaseFolder = Path.GetFullPath(databaseFolder);

            // Never echo the connection string: it may contain a password.
            Console.WriteLine("Server:          " + builder.DataSource);
            Console.WriteLine("Database:        " + builder.InitialCatalog);
            Console.WriteLine("Database folder: " + databaseFolder);
            Console.WriteLine("Sample data:     " + (arguments.SampleData ? "yes" : "no"));

            DeploymentOptions options = new DeploymentOptions
            {
                ConnectionString = connectionString,
                DatabaseFolder = databaseFolder,
                IncludeSampleData = arguments.SampleData,
                Log = Console.WriteLine
            };

            try
            {
                if (arguments.Recreate)
                {
                    DatabaseDeployer.DropDatabase(options);
                }

                DeploymentResult result = DatabaseDeployer.Deploy(options);
                Console.WriteLine(
                    "Done. Database " + (result.DatabaseCreated ? "created" : "already existed") + "; " +
                    result.ScriptsApplied.Count + " script(s) applied, " + result.BatchesExecuted + " batch(es) executed.");
                return ExitOk;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Deployment failed: " + ex.Message);
                return ExitDeploymentFailed;
            }
        }

        private static int UsageError(string message)
        {
            Console.Error.WriteLine("Error: " + message);
            Console.Error.WriteLine("Run with --help for usage.");
            return ExitUsageError;
        }

        private static string FirstNonBlank(params string[] values)
        {
            foreach (string value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }
            }

            return null;
        }

        private static void PrintUsage()
        {
            Console.WriteLine("CobLink.DbDeploy - creates and upgrades the COBLink SQL Server database.");
            Console.WriteLine();
            Console.WriteLine("Usage:");
            Console.WriteLine("  dotnet run --project tools/CobLink.DbDeploy -- --connection \"<connection string>\"");
            Console.WriteLine("      [--database-folder <path>] [--sample-data] [--recreate --yes]");
            Console.WriteLine();
            Console.WriteLine("Options:");
            Console.WriteLine("  --connection <cs>         Target connection string; Database=<name> is required. Falls back to the");
            Console.WriteLine("                            environment variables ConnectionStrings__CobLink, then COBLINK_CONNECTION.");
            Console.WriteLine("  --database-folder <path>  Folder with the scripts/ and sample-data/ sub-folders. Default: the nearest");
            Console.WriteLine("                            'database' folder above the current directory (then above the tool).");
            Console.WriteLine("  --sample-data             Also apply sample-data/*.sql.");
            Console.WriteLine("  --recreate                Drop the target database first (all data is lost). Requires --yes.");
            Console.WriteLine("  --yes                     Confirms --recreate.");
            Console.WriteLine("  --help                    Show this text.");
            Console.WriteLine();
            Console.WriteLine("Exit codes: 0 success, 1 deployment failure, 2 usage error.");
        }

        private sealed class Arguments
        {
            public string Connection { get; private set; }

            public string DatabaseFolder { get; private set; }

            public bool SampleData { get; private set; }

            public bool Recreate { get; private set; }

            public bool Yes { get; private set; }

            public bool Help { get; private set; }

            public static Arguments Parse(string[] args)
            {
                Arguments result = new Arguments();
                for (int index = 0; index < args.Length; index++)
                {
                    string name = args[index];
                    string value = null;

                    // --name=value is accepted next to --name value.
                    int separator = name.IndexOf('=');
                    if (name.StartsWith("--", StringComparison.Ordinal) && separator > 0)
                    {
                        value = name.Substring(separator + 1);
                        name = name.Substring(0, separator);
                    }

                    switch (name)
                    {
                        case "--connection":
                            result.Connection = value ?? ReadValue(args, ref index, name);
                            break;
                        case "--database-folder":
                            result.DatabaseFolder = value ?? ReadValue(args, ref index, name);
                            break;
                        case "--sample-data":
                            RejectValue(name, value);
                            result.SampleData = true;
                            break;
                        case "--recreate":
                            RejectValue(name, value);
                            result.Recreate = true;
                            break;
                        case "--yes":
                            RejectValue(name, value);
                            result.Yes = true;
                            break;
                        case "--help":
                        case "-h":
                        case "-?":
                            result.Help = true;
                            break;
                        default:
                            throw new ArgumentException("Unknown argument '" + args[index] + "'.");
                    }
                }

                return result;
            }

            private static string ReadValue(string[] args, ref int index, string name)
            {
                if (index + 1 >= args.Length)
                {
                    throw new ArgumentException("Option " + name + " needs a value.");
                }

                index++;
                return args[index];
            }

            private static void RejectValue(string name, string value)
            {
                if (value != null)
                {
                    throw new ArgumentException("Option " + name + " does not take a value.");
                }
            }
        }
    }
}

using CobLink.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;

namespace CobLink.Api
{
    public static class Program
    {
        public static void Main(string[] args)
        {
            IHost host = CreateHostBuilder(args).Build();
            DatabaseBootstrapper.Run(host.Services);
            host.Run();
        }

        // Classic generic-host pattern (pre minimal hosting). WebApplicationFactory<Startup> discovers it by name.
        public static IHostBuilder CreateHostBuilder(string[] args)
        {
            return Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder => webBuilder.UseStartup<Startup>());
        }
    }
}

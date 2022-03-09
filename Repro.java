import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Properties;

public class Repro {

    public static void main(String[] args) throws Exception {
        Connection conn = getConnection("localhost", 1111, "dba", "password");
        String[] filePaths = new String[] {
          "./insert_1.sparql",
          "./insert_2.sparql"
        };

        for(int i = 0; i < filePaths.length; i++) {
          Path req = Paths.get(filePaths[i]);
          byte[] queryBs = Files.readAllBytes(req);
          String q = new String(queryBs, "UTF-8");
          PreparedStatement ps = conn.prepareStatement("sparql\n" + q);
          int re = ps.executeUpdate();
          System.out.println(re);
        }
    }


    public static Connection getConnection(String host, Integer port, String login, String pass) throws SQLException {
        Properties connectionProps = new Properties();
        connectionProps.put("user", login);
        connectionProps.put("password", pass);
        Connection conn = DriverManager.getConnection(
                "jdbc:virtuoso://" + host + ":" + port + "/charset=UTF-8",
                connectionProps);
        return conn;
    }
}
